/**
 * Editor agent stub — fixture-based for the local pilot.
 * Assembles panels from a selected reading into a playable cut with an EDL.
 * Label: FIXTURE (no live provider spend).
 */

import type Database from "better-sqlite3";
import { nanoid } from "nanoid";
import { getLatestTreatment, type SceneReading, type ThumbnailPanel } from "./director.js";

// ── Types ────────────────────────────────────────────────────────

export interface EdlEntry {
  shotId: string;
  panelNumber: number;
  version: number;
  frameIn: number;
  frameOut: number;
  durationFrames: number;
  transition: "cut" | "dissolve";
  caption: string;
  kenBurns: string;
}

export interface AudioCue {
  id: string;
  label: string;
  frameIn: number;
  frameOut: number;
  type: "music" | "sfx" | "ambience";
}

export interface Cut {
  id: string;
  projectId: string;
  readingKey: string;
  version: number;
  fps: number;
  edl: EdlEntry[];
  cues: AudioCue[];
  isCurrent: boolean;
  totalFrames: number;
  durationSeconds: number;
}

export interface Shot {
  id: string;
  projectId: string;
  panelNumber: number;
  version: number;
  description: string;
  camera: string;
  mood: string;
  caption: string;
  durationFrames: number;
}

// ── Caption generation from panel descriptions ───────────────────

function panelCaption(panel: ThumbnailPanel, reading: SceneReading): string {
  // Generate a temp caption for the animatic (may stand in for voice/radio)
  if (panel.revealsDate) {
    if (reading.key === "discover_with_mara") {
      return "The log reads NOV 22. She just wrote NOV 23.";
    }
    return "NOV 22 on the page. The voice said November twenty-third.";
  }

  const captions: Record<string, Record<number, string>> = {
    discover_with_mara: {
      1: "02:17. The radio crackles to life.",
      2: "She reaches for the log. Routine.",
      3: "The voice gives a date. She keeps writing.",
      5: "The radio goes silent. She stares.",
    },
    audience_knows_first: {
      1: "02:17. The radio crackles. The camera looks down.",
      3: "She crosses the room. No hurry.",
      4: "She writes the date. Doesn't notice.",
      5: "Her pen stops. She reads it again.",
      6: "Now she knows what we knew.",
    },
  };
  return captions[reading.key]?.[panel.panel] ?? "";
}

/** Timing per panel in frames at 24fps. Dramatic beats get more time. */
function panelDuration(panel: ThumbnailPanel, reading: SceneReading): number {
  if (panel.revealsDate) return 96; // 4 seconds — the reveal
  const idx = reading.panels.indexOf(panel);
  if (idx === 0) return 72; // 3s opening
  if (idx === reading.panels.length - 1) return 84; // 3.5s closing
  return 72; // 3s default
}

// ── Build shots and EDL from a reading ───────────────────────────

export function buildCutForReading(
  db: Database.Database,
  projectId: string,
  readingKey: string,
): Cut | null {
  const treatment = getLatestTreatment(db, projectId);
  if (!treatment) return null;

  const reading = treatment.readings.find((r) => r.key === readingKey);
  if (!reading) return null;

  // Check if a current cut already exists
  const existing = db
    .prepare(
      "SELECT * FROM cuts WHERE project_id = ? AND reading_key = ? AND is_current = 1",
    )
    .get(projectId, readingKey) as any;
  if (existing) return parseCutRow(existing);

  // Create shots from panels
  const shots: Shot[] = [];
  for (const panel of reading.panels) {
    const shotId = `shot_${nanoid(8)}`;
    const duration = panelDuration(panel, reading);
    const caption = panelCaption(panel, reading);

    db.prepare(
      `INSERT INTO shots (id, project_id, panel_number, version, description, camera, mood, caption, duration_frames)
       VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)`,
    ).run(shotId, projectId, panel.panel, panel.description, panel.camera, panel.mood, caption, duration);

    shots.push({
      id: shotId,
      projectId,
      panelNumber: panel.panel,
      version: 1,
      description: panel.description,
      camera: panel.camera,
      mood: panel.mood,
      caption,
      durationFrames: duration,
    });
  }

  // Build EDL
  let frameOffset = 0;
  const edl: EdlEntry[] = shots.map((shot, i) => {
    const entry: EdlEntry = {
      shotId: shot.id,
      panelNumber: shot.panelNumber,
      version: shot.version,
      frameIn: frameOffset,
      frameOut: frameOffset + shot.durationFrames - 1,
      durationFrames: shot.durationFrames,
      transition: i === 0 ? "cut" : "cut",
      caption: shot.caption,
      kenBurns: "slow_push", // default for storyboard panels
    };
    frameOffset += shot.durationFrames;
    return entry;
  });

  // Build audio cues (fixture)
  const totalFrames = frameOffset;
  const cues: AudioCue[] = [
    {
      id: `cue_${nanoid(6)}`,
      label: "Sea ambience",
      frameIn: 0,
      frameOut: totalFrames - 1,
      type: "ambience",
    },
    {
      id: `cue_${nanoid(6)}`,
      label: "Radio crackle",
      frameIn: edl[0].frameIn,
      frameOut: edl[1]?.frameOut ?? edl[0].frameOut,
      type: "sfx",
    },
    {
      id: `cue_${nanoid(6)}`,
      label: "Low cello drone",
      // Music enters at the reveal panel and runs to the end
      frameIn: edl.find((e) => {
        const panel = reading.panels.find((p) => p.panel === e.panelNumber);
        return panel?.revealsDate;
      })?.frameIn ?? Math.floor(totalFrames / 2),
      frameOut: totalFrames - 1,
      type: "music",
    },
  ];

  // Save cut
  const cutId = `cut_${nanoid(8)}`;
  db.prepare(
    `INSERT INTO cuts (id, project_id, reading_key, version, fps, edl, cues, is_current)
     VALUES (?, ?, ?, 1, 24, ?, ?, 1)`,
  ).run(cutId, projectId, readingKey, JSON.stringify(edl), JSON.stringify(cues));

  return {
    id: cutId,
    projectId,
    readingKey,
    version: 1,
    fps: 24,
    edl,
    cues,
    isCurrent: true,
    totalFrames,
    durationSeconds: totalFrames / 24,
  };
}

/** Replace a shot in the current cut. Creates a new cut version. Flags neighbours. */
export function replaceShot(
  db: Database.Database,
  projectId: string,
  readingKey: string,
  shotId: string,
  update: { description?: string; caption?: string; durationFrames?: number },
): { cut: Cut; flaggedShots: string[] } | null {
  // Get current cut
  const currentCut = db
    .prepare(
      "SELECT * FROM cuts WHERE project_id = ? AND reading_key = ? AND is_current = 1",
    )
    .get(projectId, readingKey) as any;
  if (!currentCut) return null;

  const edl: EdlEntry[] = JSON.parse(currentCut.edl);
  const cues: AudioCue[] = JSON.parse(currentCut.cues);

  const shotIdx = edl.findIndex((e) => e.shotId === shotId);
  if (shotIdx === -1) return null;

  // Get existing shot
  const existingShot = db
    .prepare("SELECT * FROM shots WHERE id = ?")
    .get(shotId) as any;
  if (!existingShot) return null;

  // Create new shot version
  const newVersion = existingShot.version + 1;
  const newShotId = `shot_${nanoid(8)}`;
  const newDuration = update.durationFrames ?? existingShot.duration_frames;
  const newDesc = update.description ?? existingShot.description;
  const newCaption = update.caption ?? existingShot.caption;

  db.prepare(
    `INSERT INTO shots (id, project_id, panel_number, version, description, camera, mood, caption, duration_frames)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(newShotId, projectId, existingShot.panel_number, newVersion, newDesc, existingShot.camera, existingShot.mood, newCaption, newDuration);

  // Build new EDL with updated shot
  const durationChanged = newDuration !== existingShot.duration_frames;
  let frameOffset = 0;
  const newEdl: EdlEntry[] = edl.map((entry, i) => {
    const dur = i === shotIdx ? newDuration : entry.durationFrames;
    const newEntry: EdlEntry = {
      ...entry,
      shotId: i === shotIdx ? newShotId : entry.shotId,
      version: i === shotIdx ? newVersion : entry.version,
      frameIn: frameOffset,
      frameOut: frameOffset + dur - 1,
      durationFrames: dur,
      caption: i === shotIdx ? newCaption : entry.caption,
    };
    frameOffset += dur;
    return newEntry;
  });

  // Re-time cues if duration changed
  const totalFrames = frameOffset;
  const newCues: AudioCue[] = cues.map((cue) => ({
    ...cue,
    frameOut: Math.min(cue.frameOut, totalFrames - 1),
  }));

  // Mark old cut as not current
  db.prepare(
    "UPDATE cuts SET is_current = 0 WHERE id = ?",
  ).run(currentCut.id);

  // Save new cut version
  const newCutId = `cut_${nanoid(8)}`;
  const newCutVersion = currentCut.version + 1;
  db.prepare(
    `INSERT INTO cuts (id, project_id, reading_key, version, fps, edl, cues, is_current)
     VALUES (?, ?, ?, ?, 24, ?, ?, 1)`,
  ).run(newCutId, projectId, readingKey, newCutVersion, JSON.stringify(newEdl), JSON.stringify(newCues));

  // Flag neighbours (2 on each side per AG-DIR-15 / AC-39)
  const flaggedShots: string[] = [];
  for (let offset = -2; offset <= 2; offset++) {
    if (offset === 0) continue;
    const ni = shotIdx + offset;
    if (ni >= 0 && ni < newEdl.length) {
      const neighbour = newEdl[ni];
      const flagId = `flag_${nanoid(8)}`;
      db.prepare(
        `INSERT INTO shot_flags (id, project_id, cut_id, shot_id, reason, source_shot_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        flagId,
        projectId,
        newCutId,
        neighbour.shotId,
        durationChanged ? "neighbour_duration_changed" : "neighbour_content_changed",
        newShotId,
      );
      flaggedShots.push(neighbour.shotId);
    }
  }

  // Flag spanning cues (cues that overlap the changed shot's time range)
  const changedEntry = newEdl[shotIdx];
  for (const cue of newCues) {
    if (cue.frameIn <= changedEntry.frameOut && cue.frameOut >= changedEntry.frameIn) {
      const flagId = `flag_${nanoid(8)}`;
      db.prepare(
        `INSERT INTO shot_flags (id, project_id, cut_id, shot_id, reason, source_shot_id)
         VALUES (?, ?, ?, ?, 'spanning_cue', ?)`,
      ).run(flagId, projectId, newCutId, changedEntry.shotId, newShotId);
    }
  }

  const cut: Cut = {
    id: newCutId,
    projectId,
    readingKey,
    version: newCutVersion,
    fps: 24,
    edl: newEdl,
    cues: newCues,
    isCurrent: true,
    totalFrames,
    durationSeconds: totalFrames / 24,
  };

  return { cut, flaggedShots };
}

/** Get the current cut for a reading. */
export function getCurrentCut(
  db: Database.Database,
  projectId: string,
  readingKey: string,
): Cut | null {
  const row = db
    .prepare(
      "SELECT * FROM cuts WHERE project_id = ? AND reading_key = ? AND is_current = 1",
    )
    .get(projectId, readingKey) as any;
  if (!row) return null;
  return parseCutRow(row);
}

/** Get all cuts for a reading (version history). */
export function getCutHistory(
  db: Database.Database,
  projectId: string,
  readingKey: string,
): Cut[] {
  const rows = db
    .prepare(
      "SELECT * FROM cuts WHERE project_id = ? AND reading_key = ? ORDER BY version DESC",
    )
    .all(projectId, readingKey) as any[];
  return rows.map(parseCutRow);
}

/** Get flags for a cut. */
export function getCutFlags(
  db: Database.Database,
  cutId: string,
): { id: string; shotId: string; reason: string; sourceShortId: string; resolved: boolean }[] {
  const rows = db
    .prepare("SELECT * FROM shot_flags WHERE cut_id = ? AND resolved = 0")
    .all(cutId) as any[];
  return rows.map((r) => ({
    id: r.id,
    shotId: r.shot_id,
    reason: r.reason,
    sourceShortId: r.source_shot_id,
    resolved: !!r.resolved,
  }));
}

function parseCutRow(row: any): Cut {
  const edl: EdlEntry[] = JSON.parse(row.edl);
  const totalFrames = edl.length > 0 ? edl[edl.length - 1].frameOut + 1 : 0;
  return {
    id: row.id,
    projectId: row.project_id,
    readingKey: row.reading_key,
    version: row.version,
    fps: row.fps,
    edl,
    cues: JSON.parse(row.cues),
    isCurrent: !!row.is_current,
    totalFrames,
    durationSeconds: totalFrames / row.fps,
  };
}

/**
 * Director agent stub — fixture-based for the local pilot.
 * Produces a treatment with two readings of the lighthouse scene (D1–D4).
 * Label: FIXTURE (no live provider spend).
 */

import type Database from "better-sqlite3";
import { nanoid } from "nanoid";

export interface ThumbnailPanel {
  panel: number;
  shot: string;
  description: string;
  camera: string;
  mood: string;
  revealsDate: boolean;
}

export interface SceneReading {
  key: string;
  title: string;
  brief: {
    pointOfView: string;
    want: string;
    change: string;
    revealingCue: string;
    whoKnowsWhat: string;
    feelingPerBeat: string[];
    turnMoment: string;
  };
  panels: ThumbnailPanel[];
  audienceExperience: string;
}

export interface LookTest {
  id: string;
  description: string;
  camera: string;
  lighting: string;
  palette: string;
}

export interface SoundSketch {
  description: string;
  genre: string;
  instrumentation: string;
  tempo: string;
  duration: string;
  mood: string;
}

export interface Treatment {
  id: string;
  projectId: string;
  version: number;
  toneWords: string[];
  themes: string[];
  visualGrammar: {
    palette: string;
    light: string;
    lens: string;
    framing: string;
    movement: string;
    texture: string;
  };
  sonicPalette: string;
  doList: string[];
  dontList: string[];
  lookTests: LookTest[];
  soundSketch: SoundSketch;
  readings: SceneReading[];
}

/** Build the fixture treatment for the lighthouse pilot. */
export function buildTreatment(
  db: Database.Database,
  projectId: string,
): Treatment | null {
  const project = db
    .prepare("SELECT id, stage FROM projects WHERE id = ?")
    .get(projectId) as any;
  if (!project) return null;

  // Check if a treatment already exists
  const existing = db
    .prepare(
      "SELECT * FROM treatments WHERE project_id = ? ORDER BY version DESC LIMIT 1",
    )
    .get(projectId) as any;
  if (existing) return parseTreatmentRow(existing);

  const id = `treat_${nanoid(8)}`;

  const treatment: Omit<Treatment, "id"> = {
    projectId,
    version: 1,
    toneWords: ["Quiet dread", "Salt-worn", "Reluctant tenderness", "Analog warmth", "Tidal patience"],
    themes: [
      "Isolation vs. connection — solitude chosen as armour, undone by responsibility",
      "The cost of caring — each rescue drains something Mara can't name",
      "Whether saving others can save yourself — the final call forces the question",
    ],
    visualGrammar: {
      palette:
        "Desaturated blue-grey base. Warm amber only from the lighthouse lamp and the radio dial. Skin tones muted except in close-up during rescues (slight warmth returns).",
      light:
        "Overcast naturalism by day; single hard-source practicals at night (the lamp, the radio glow, Dez's boat light). No fill. Faces half-lit.",
      lens:
        "35 mm for interiors (Mara's space), 65 mm for close-ups (her hands, the radio dial, the log entry). Wide 24 mm only for the sea and the final storm.",
      framing:
        "Mara centred and static in the first act; gradually pushed to frame edges as the calls crowd her routine. After the final rescue she returns to centre but the frame is wider — room for someone else.",
      movement:
        "Locked tripod by default. Slow push-ins on the radio moments. Handheld only during the storm launch (scene 12).",
      texture:
        "Visible grain, especially at night. Slight halation around the lamp. The image should feel like a photograph found in a drawer.",
    },
    sonicPalette:
      "Low cello drone under the radio scenes. Sea ambience (wind, wave, gull) as a constant bed — its absence signals something wrong. The radio crackle is the most designed sound: analog static that resolves into voice. No score during the first rescue; score returns only when Mara starts caring.",
    doList: [
      "Hold on stillness — let the audience feel the weight of silence",
      "Show Mara's routine so the disruption registers",
      "Use the radio dial close-up as a recurring visual anchor",
      "Keep Dez's scenes practical — supply manifest, fuel log, weather",
      "Let the final image rhyme with the opening: same lighthouse, different door",
    ],
    dontList: [
      "No jump scares from the radio — the dread is anticipatory, not sudden",
      "No exposition about why the radio works — it simply does",
      "No romantic subplot between Mara and Dez",
      "No flashbacks to Mara's past — her history shows in how she moves, not in memory",
      "No conventional score swell at the climax — the storm is the music",
    ],
    lookTests: [
      {
        id: `lt_${nanoid(6)}`,
        description: "Mara at the radio desk, night. Single amber source from the dial. Face half-lit, hands visible. Grain prominent.",
        camera: "65 mm, eye level, shallow focus on hands",
        lighting: "Practical radio glow only, no fill",
        palette: "Deep blue-grey, amber accent on dial and fingers",
      },
      {
        id: `lt_${nanoid(6)}`,
        description: "Lighthouse exterior at dusk. Sea fog. The lamp is the only warm element in a grey field.",
        camera: "24 mm, low angle from the rocks looking up",
        lighting: "Overcast ambient, lamp as hard warm source above",
        palette: "Slate grey, desaturated blue sea, single amber lamp",
      },
      {
        id: `lt_${nanoid(6)}`,
        description: "Mara on the tender in pre-dawn dark, heading toward coordinates. Water black, sky navy. Her face lit by a hand torch.",
        camera: "35 mm, boat-mounted, slight motion",
        lighting: "Torch key on face, ambient moonlight on water",
        palette: "Near-black water, cool blue-grey sky, warm torch on skin",
      },
      {
        id: `lt_${nanoid(6)}`,
        description: "Dez on the jetty, midday overcast. Supply crates. Businesslike posture, hands busy with rope.",
        camera: "35 mm, medium shot, tripod",
        lighting: "Flat overcast daylight, no shadows",
        palette: "Muted green-grey, salt-bleached wood, weathered clothing",
      },
    ],
    soundSketch: {
      description:
        "30-second sketch: low cello note sustained, rising sea-wind bed, radio static crackle resolving into a faint distorted voice giving coordinates, then silence. The cello returns a half-step higher — unresolved.",
      genre: "Minimal ambient / chamber",
      instrumentation: "Solo cello, sea-wind field recording, processed radio static",
      tempo: "Free tempo, approximately 50 BPM pulse",
      duration: "30 seconds",
      mood: "Dread tempered by loneliness — not horror, but the weight of knowing something is coming",
    },
    readings: [
      {
        key: "discover_with_mara",
        title: "Discover it with Mara",
        brief: {
          pointOfView: "We are with Mara, knowing only what she knows",
          want: "Mara wants to log the call and go back to sleep",
          change: "She realises the date is tomorrow — the call is from the future",
          revealingCue:
            "Panel 4: close-up of her pen stopping on the date in the log. The audience and Mara see the mismatch at the same instant.",
          whoKnowsWhat:
            "Neither Mara nor the audience knows the date is wrong until she checks the log. The reveal is simultaneous.",
          feelingPerBeat: [
            "Routine annoyance — the radio shouldn't be on",
            "Mild curiosity — she starts writing down coordinates",
            "Confusion — the caller says a date",
            "Discovery — her pen stops; we see the log date and the caller's date don't match",
            "Dread — she looks at the radio as if it has changed shape",
          ],
          turnMoment:
            "The pen stops. The camera holds on the two dates visible in the same frame.",
        },
        panels: [
          {
            panel: 1,
            shot: "INT. RADIO ROOM — NIGHT. Wide shot.",
            description:
              "Mara asleep in the chair. The radio crackles to life. Green dial glow on her face.",
            camera: "35 mm, locked, eye level",
            mood: "Still, interrupted silence",
            revealsDate: false,
          },
          {
            panel: 2,
            shot: "CU radio dial and Mara's hand reaching for the log book.",
            description:
              "She pulls the log toward her, pen ready. The voice on the radio is giving coordinates. Routine.",
            camera: "65 mm, overhead insert",
            mood: "Automatic, half-awake",
            revealsDate: false,
          },
          {
            panel: 3,
            shot: "MCU Mara writing. Radio voice says the date.",
            description:
              "She writes the coordinates. The voice says: 'November twenty-third.' She keeps writing — hasn't registered it yet.",
            camera: "65 mm, over-shoulder on the page",
            mood: "Transitional — the information is in the air but not yet caught",
            revealsDate: false,
          },
          {
            panel: 4,
            shot: "INSERT: the log page. Her pen has stopped.",
            description:
              "Top of the page: 'NOV 22'. The line she just wrote: coordinates and 'NOV 23'. The pen has stopped between the two dates. This is the reveal.",
            camera: "65 mm macro, shallow focus",
            mood: "Discovery — the audience sees it when Mara does",
            revealsDate: true,
          },
          {
            panel: 5,
            shot: "CU Mara's face. She looks up at the radio.",
            description:
              "The radio has gone silent. Static hiss. Her expression shifts from confusion to something she doesn't yet have a word for.",
            camera: "65 mm, eye level, locked",
            mood: "Dread — quiet, internal",
            revealsDate: false,
          },
        ],
        audienceExperience:
          "We make the discovery with Mara. The date mismatch lands as a shared shock — we were reading the page at the same pace she was writing it.",
      },
      {
        key: "audience_knows_first",
        title: "Let the audience know first",
        brief: {
          pointOfView:
            "The camera gives the audience information before Mara has it",
          want: "Mara wants to log the call and go back to sleep",
          change: "She realises the date is tomorrow — but we already knew",
          revealingCue:
            "Panel 2: the camera lingers on the dated log entry ('NOV 22') before the radio voice says 'November twenty-third.' The audience catches the mismatch; Mara is across the room.",
          whoKnowsWhat:
            "The audience knows the date is wrong from panel 2. Mara doesn't know until panel 5 when she finally reads what she wrote. The gap between our knowledge and hers creates suspense.",
          feelingPerBeat: [
            "Setup — we see the log date clearly before anything happens",
            "Information — the radio voice gives tomorrow's date; we catch it, Mara doesn't",
            "Suspense — she walks to the desk, unhurried; we wait",
            "Dramatic irony — she writes the date down without noticing",
            "Delayed discovery — she pauses, re-reads, and we watch her catch up to what we already know",
          ],
          turnMoment:
            "Panel 5: the moment Mara's expression changes. The suspense breaks not with new information but with recognition.",
        },
        panels: [
          {
            panel: 1,
            shot: "INT. RADIO ROOM — NIGHT. Wide shot, same setup as Reading A.",
            description:
              "Mara asleep. Radio crackles. But before she wakes, the camera tilts down to the log book on the desk.",
            camera: "35 mm, locked, slow tilt down",
            mood: "Deliberate, the camera has its own attention",
            revealsDate: false,
          },
          {
            panel: 2,
            shot: "INSERT: log book, top of page. 'NOV 22' clearly visible.",
            description:
              "The camera holds on the date for a beat. Then the radio voice, off-screen: 'Coordinates... November twenty-third.' The audience reads and hears the mismatch. Mara is still across the room waking up.",
            camera: "65 mm macro, locked",
            mood: "The audience knows — suspense begins",
            revealsDate: true,
          },
          {
            panel: 3,
            shot: "Wide shot. Mara crosses to the desk.",
            description:
              "She walks slowly — rubbing her eyes, in no hurry. The camera stays wide, letting the distance between her and the information stretch.",
            camera: "24 mm, locked, full room visible",
            mood: "Dramatic irony — an ordinary walk made tense by what we know",
            revealsDate: false,
          },
          {
            panel: 4,
            shot: "MCU Mara writing in the log.",
            description:
              "She writes the coordinates and the date mechanically. She hasn't looked at the top of the page yet.",
            camera: "65 mm, over-shoulder",
            mood: "We hold our breath — she's writing the wrong date and doesn't know it",
            revealsDate: false,
          },
          {
            panel: 5,
            shot: "CU Mara's face. Her pen stops. She re-reads.",
            description:
              "Her eyes move up the page. The realisation arrives. We've been waiting for this moment since panel 2.",
            camera: "65 mm, eye level, locked",
            mood: "Release of suspense — recognition, then dread",
            revealsDate: false,
          },
          {
            panel: 6,
            shot: "Same CU. She looks up at the radio.",
            description:
              "Same framing as Reading A panel 5, but the emotional weight is different — we've carried the knowledge longer than she has.",
            camera: "65 mm, eye level, locked",
            mood: "Shared dread — now we're on the same page",
            revealsDate: false,
          },
        ],
        audienceExperience:
          "We understand first. An ordinary walk across the room turns tense because we know what she doesn't. The reveal isn't a surprise — it's the relief and dread of watching someone finally see what we've been holding.",
      },
    ],
  };

  db.prepare(
    `INSERT INTO treatments (id, project_id, version, tone_words, themes, visual_grammar, sonic_palette, do_list, dont_list, look_tests, sound_sketch, readings)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    projectId,
    treatment.version,
    JSON.stringify(treatment.toneWords),
    JSON.stringify(treatment.themes),
    JSON.stringify(treatment.visualGrammar),
    treatment.sonicPalette,
    JSON.stringify(treatment.doList),
    JSON.stringify(treatment.dontList),
    JSON.stringify(treatment.lookTests),
    JSON.stringify(treatment.soundSketch),
    JSON.stringify(treatment.readings),
  );

  return { id, ...treatment };
}

function parseTreatmentRow(row: any): Treatment {
  return {
    id: row.id,
    projectId: row.project_id,
    version: row.version,
    toneWords: JSON.parse(row.tone_words),
    themes: JSON.parse(row.themes),
    visualGrammar: JSON.parse(row.visual_grammar),
    sonicPalette: row.sonic_palette,
    doList: JSON.parse(row.do_list),
    dontList: JSON.parse(row.dont_list),
    lookTests: JSON.parse(row.look_tests),
    soundSketch: JSON.parse(row.sound_sketch),
    readings: JSON.parse(row.readings),
  };
}

/** Get the latest treatment for a project. */
export function getLatestTreatment(
  db: Database.Database,
  projectId: string,
): Treatment | null {
  const row = db
    .prepare(
      "SELECT * FROM treatments WHERE project_id = ? ORDER BY version DESC LIMIT 1",
    )
    .get(projectId) as any;
  if (!row) return null;
  return parseTreatmentRow(row);
}

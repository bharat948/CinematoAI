import { Router, type Request, type Response } from "express";
import type Database from "better-sqlite3";
import { nanoid } from "nanoid";
import {
  buildCutForReading,
  getCurrentCut,
  getCutHistory,
  getCutFlags,
  replaceShot,
} from "../agents/editor.js";

export function cutRoutes(db: Database.Database): Router {
  const r = Router({ mergeParams: true });

  // POST /api/v1/projects/:id/cuts — build cuts for the selected reading
  r.post("/", (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const { readingKey } = req.body ?? {};

    if (!readingKey) {
      res.status(400).json({ type: "validation", title: "readingKey is required" });
      return;
    }

    const cut = buildCutForReading(db, projectId, readingKey);
    if (!cut) {
      res.status(409).json({ type: "conflict", title: "Cannot build cut — missing treatment or reading" });
      return;
    }

    res.status(201).json(cut);
  });

  // GET /api/v1/projects/:id/cuts?reading=KEY — get current cut
  r.get("/", (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const readingKey = req.query.reading as string;

    if (!readingKey) {
      res.status(400).json({ type: "validation", title: "reading query param is required" });
      return;
    }

    const cut = getCurrentCut(db, projectId, readingKey);
    if (!cut) {
      res.status(404).json({ type: "not_found", title: "No current cut for this reading" });
      return;
    }

    const flags = getCutFlags(db, cut.id);
    res.json({ ...cut, flags });
  });

  // GET /api/v1/projects/:id/cuts/history?reading=KEY — cut version history
  r.get("/history", (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const readingKey = req.query.reading as string;

    if (!readingKey) {
      res.status(400).json({ type: "validation", title: "reading query param is required" });
      return;
    }

    const cuts = getCutHistory(db, projectId, readingKey);
    res.json(cuts);
  });

  // POST /api/v1/projects/:id/cuts/replace-shot — replace a shot, get new cut + flags
  r.post("/replace-shot", (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const { readingKey, shotId, description, caption, durationFrames } = req.body ?? {};

    if (!readingKey || !shotId) {
      res.status(400).json({ type: "validation", title: "readingKey and shotId are required" });
      return;
    }

    const result = replaceShot(db, projectId, readingKey, shotId, {
      description,
      caption,
      durationFrames,
    });
    if (!result) {
      res.status(404).json({ type: "not_found", title: "Shot or cut not found" });
      return;
    }

    const flags = getCutFlags(db, result.cut.id);
    res.json({ cut: result.cut, flaggedShots: result.flaggedShots, flags });
  });

  // ── Timed notes ────────────────────────────────────────────────

  // POST /api/v1/projects/:id/cuts/notes — create a timed note on a cut
  r.post("/notes", (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const { cutId, shotId, tcIn, tcOut, observation, intended, gap, ownerAgent, experiment, priority } = req.body ?? {};

    if (!cutId || !shotId || !tcIn || !tcOut) {
      res.status(400).json({
        type: "validation",
        title: "cutId, shotId, tcIn, tcOut are required (AG-DIR-13)",
      });
      return;
    }

    if (!ownerAgent) {
      res.status(400).json({
        type: "validation",
        title: "ownerAgent is required — a note with no owner fails AG-DIR-13",
      });
      return;
    }

    const id = `note_${nanoid(8)}`;
    db.prepare(
      `INSERT INTO timed_notes (id, project_id, cut_id, shot_id, tc_in, tc_out, observation, intended, gap, owner_agent, experiment, priority)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, projectId, cutId, shotId, tcIn, tcOut, observation ?? "", intended ?? "", gap ?? "", ownerAgent, experiment ?? "", priority ?? "medium");

    res.status(201).json({
      id,
      cutId,
      shotId,
      tcIn,
      tcOut,
      observation,
      intended,
      gap,
      ownerAgent,
      experiment,
      priority: priority ?? "medium",
      status: "open",
    });
  });

  // GET /api/v1/projects/:id/cuts/notes?cutId=ID — get notes for a cut
  r.get("/notes", (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const cutId = req.query.cutId as string;

    if (!cutId) {
      res.status(400).json({ type: "validation", title: "cutId query param is required" });
      return;
    }

    const rows = db
      .prepare(
        "SELECT * FROM timed_notes WHERE project_id = ? AND cut_id = ? ORDER BY created_at",
      )
      .all(projectId, cutId) as any[];

    res.json(
      rows.map((n) => ({
        id: n.id,
        cutId: n.cut_id,
        shotId: n.shot_id,
        tcIn: n.tc_in,
        tcOut: n.tc_out,
        observation: n.observation,
        intended: n.intended,
        gap: n.gap,
        ownerAgent: n.owner_agent,
        experiment: n.experiment,
        priority: n.priority,
        status: n.status,
        createdAt: n.created_at,
      })),
    );
  });

  return r;
}

import { Router, type Request, type Response } from "express";
import type Database from "better-sqlite3";
import { nanoid } from "nanoid";
import { getLatestBible } from "../agents/story.js";
import { buildTreatment, getLatestTreatment } from "../agents/director.js";

export function gateRoutes(db: Database.Database): Router {
  const r = Router({ mergeParams: true });

  // ── Gate 1: Story ──────────────────────────────────────────────

  // GET /api/v1/projects/:id/gates/story — Gate 1 summary
  r.get("/story", (req: Request, res: Response) => {
    const projectId = req.params.id as string;

    const project = db
      .prepare("SELECT id, stage, gates FROM projects WHERE id = ?")
      .get(projectId) as any;
    if (!project) {
      res.status(404).json({ type: "not_found", title: "Project not found" });
      return;
    }

    const gates = JSON.parse(project.gates);
    const bible = getLatestBible(db, projectId);

    const decision = db
      .prepare(
        "SELECT * FROM gate_decisions WHERE project_id = ? AND gate = 'story' ORDER BY created_at DESC LIMIT 1",
      )
      .get(projectId) as any;

    res.json({
      gate: "story",
      status: gates.story,
      stage: project.stage,
      bible: bible ?? null,
      decision: decision
        ? {
            id: decision.id,
            decision: decision.decision,
            notes: decision.notes,
            bibleVersion: decision.bible_version,
            decidedBy: decision.decided_by,
            createdAt: decision.created_at,
          }
        : null,
    });
  });

  // POST /api/v1/projects/:id/gates/story — approve or send back
  r.post("/story", (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const { decision, notes } = req.body ?? {};

    if (!decision || !["approved", "sent_back"].includes(decision)) {
      res.status(400).json({
        type: "validation",
        title: "decision must be 'approved' or 'sent_back'",
      });
      return;
    }

    const project = db
      .prepare("SELECT id, stage, gates FROM projects WHERE id = ?")
      .get(projectId) as any;
    if (!project) {
      res.status(404).json({ type: "not_found", title: "Project not found" });
      return;
    }

    const gates = JSON.parse(project.gates);

    // Idempotency: if already approved, don't advance again (AC-06)
    if (gates.story === "approved" && decision === "approved") {
      const existing = db
        .prepare(
          "SELECT * FROM gate_decisions WHERE project_id = ? AND gate = 'story' AND decision = 'approved' ORDER BY created_at DESC LIMIT 1",
        )
        .get(projectId) as any;
      res.json({
        gate: "story",
        status: "approved",
        decision: {
          id: existing.id,
          decision: existing.decision,
          notes: existing.notes,
          bibleVersion: existing.bible_version,
          decidedBy: existing.decided_by,
          createdAt: existing.created_at,
        },
        alreadyApproved: true,
      });
      return;
    }

    if (project.stage !== "story_review") {
      res.status(409).json({
        type: "conflict",
        title: `Gate 1 requires stage story_review, current: ${project.stage}`,
      });
      return;
    }

    const bible = getLatestBible(db, projectId);
    if (!bible) {
      res.status(409).json({
        type: "conflict",
        title: "No story bible exists for this project",
      });
      return;
    }

    const decisionId = `gd_${nanoid(8)}`;
    db.prepare(
      "INSERT INTO gate_decisions (id, project_id, gate, decision, notes, bible_version, decided_by) VALUES (?, ?, 'story', ?, ?, ?, 'filmmaker')",
    ).run(decisionId, projectId, decision, notes ?? "", bible.version);

    if (decision === "approved") {
      gates.story = "approved";
      db.prepare(
        "UPDATE projects SET stage = 'director_intake', gates = ?, updated_at = datetime('now') WHERE id = ?",
      ).run(JSON.stringify(gates), projectId);

      // Director runs D1–D4: build treatment with two readings (fixture)
      const treatment = buildTreatment(db, projectId);
      if (treatment) {
        // Advance through director pipeline to treatment_review
        db.prepare(
          "UPDATE projects SET stage = 'treatment_review', updated_at = datetime('now') WHERE id = ?",
        ).run(projectId);
      }

      res.json({
        gate: "story",
        status: "approved",
        decision: {
          id: decisionId,
          decision: "approved",
          notes: notes ?? "",
          bibleVersion: bible.version,
          decidedBy: "filmmaker",
        },
        treatment: treatment
          ? { id: treatment.id, version: treatment.version }
          : undefined,
      });
    } else {
      // Send back — return to story_interview
      db.prepare(
        "UPDATE projects SET stage = 'story_interview', updated_at = datetime('now') WHERE id = ?",
      ).run(projectId);

      res.json({
        gate: "story",
        status: "pending",
        decision: {
          id: decisionId,
          decision: "sent_back",
          notes: notes ?? "",
          bibleVersion: bible.version,
          decidedBy: "filmmaker",
        },
      });
    }
  });

  // ── Gate 2: Treatment ──────────────────────────────────────────

  // GET /api/v1/projects/:id/gates/treatment — Gate 2 summary
  r.get("/treatment", (req: Request, res: Response) => {
    const projectId = req.params.id as string;

    const project = db
      .prepare("SELECT id, stage, gates FROM projects WHERE id = ?")
      .get(projectId) as any;
    if (!project) {
      res.status(404).json({ type: "not_found", title: "Project not found" });
      return;
    }

    const gates = JSON.parse(project.gates);
    const treatment = getLatestTreatment(db, projectId);

    const decision = db
      .prepare(
        "SELECT * FROM gate_decisions WHERE project_id = ? AND gate = 'treatment' ORDER BY created_at DESC LIMIT 1",
      )
      .get(projectId) as any;

    const selection = db
      .prepare(
        "SELECT * FROM reading_selections WHERE project_id = ? ORDER BY created_at DESC LIMIT 1",
      )
      .get(projectId) as any;

    res.json({
      gate: "treatment",
      status: gates.treatment,
      stage: project.stage,
      treatment: treatment ?? null,
      selectedReading: selection
        ? {
            id: selection.id,
            readingKey: selection.reading_key,
            decidedBy: selection.decided_by,
            createdAt: selection.created_at,
          }
        : null,
      decision: decision
        ? {
            id: decision.id,
            decision: decision.decision,
            notes: decision.notes,
            decidedBy: decision.decided_by,
            createdAt: decision.created_at,
          }
        : null,
    });
  });

  // POST /api/v1/projects/:id/gates/treatment — approve with reading selection, or send back
  r.post("/treatment", (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const { decision, notes, selectedReading } = req.body ?? {};

    if (!decision || !["approved", "sent_back"].includes(decision)) {
      res.status(400).json({
        type: "validation",
        title: "decision must be 'approved' or 'sent_back'",
      });
      return;
    }

    const project = db
      .prepare("SELECT id, stage, gates FROM projects WHERE id = ?")
      .get(projectId) as any;
    if (!project) {
      res.status(404).json({ type: "not_found", title: "Project not found" });
      return;
    }

    const gates = JSON.parse(project.gates);

    // Idempotency: if already approved, don't advance again
    if (gates.treatment === "approved" && decision === "approved") {
      const existing = db
        .prepare(
          "SELECT * FROM gate_decisions WHERE project_id = ? AND gate = 'treatment' AND decision = 'approved' ORDER BY created_at DESC LIMIT 1",
        )
        .get(projectId) as any;
      const sel = db
        .prepare(
          "SELECT * FROM reading_selections WHERE project_id = ? ORDER BY created_at DESC LIMIT 1",
        )
        .get(projectId) as any;
      res.json({
        gate: "treatment",
        status: "approved",
        decision: existing
          ? {
              id: existing.id,
              decision: existing.decision,
              notes: existing.notes,
              decidedBy: existing.decided_by,
            }
          : null,
        selectedReading: sel
          ? { readingKey: sel.reading_key, decidedBy: sel.decided_by }
          : null,
        alreadyApproved: true,
      });
      return;
    }

    if (project.stage !== "treatment_review") {
      res.status(409).json({
        type: "conflict",
        title: `Gate 2 requires stage treatment_review, current: ${project.stage}`,
      });
      return;
    }

    const treatment = getLatestTreatment(db, projectId);
    if (!treatment) {
      res.status(409).json({
        type: "conflict",
        title: "No treatment exists for this project",
      });
      return;
    }

    if (decision === "approved") {
      // Require a reading selection (BR-20)
      if (
        !selectedReading ||
        !treatment.readings.some((r) => r.key === selectedReading)
      ) {
        const validKeys = treatment.readings.map((r) => r.key);
        res.status(400).json({
          type: "validation",
          title: `selectedReading must be one of: ${validKeys.join(", ")}`,
        });
        return;
      }

      // Save reading selection
      const selId = `rs_${nanoid(8)}`;
      db.prepare(
        "INSERT OR REPLACE INTO reading_selections (id, project_id, treatment_id, reading_key, decided_by) VALUES (?, ?, ?, ?, 'filmmaker')",
      ).run(selId, projectId, treatment.id, selectedReading);

      // Save gate decision
      const decisionId = `gd_${nanoid(8)}`;
      db.prepare(
        "INSERT INTO gate_decisions (id, project_id, gate, decision, notes, bible_version, decided_by) VALUES (?, ?, 'treatment', 'approved', ?, ?, 'filmmaker')",
      ).run(decisionId, projectId, notes ?? "", treatment.version);

      gates.treatment = "approved";
      db.prepare(
        "UPDATE projects SET stage = 'crew_planning', gates = ?, updated_at = datetime('now') WHERE id = ?",
      ).run(JSON.stringify(gates), projectId);

      res.json({
        gate: "treatment",
        status: "approved",
        decision: {
          id: decisionId,
          decision: "approved",
          notes: notes ?? "",
          decidedBy: "filmmaker",
        },
        selectedReading: {
          id: selId,
          readingKey: selectedReading,
          decidedBy: "filmmaker",
        },
      });
    } else {
      // Send back — return to treatment stage
      const decisionId = `gd_${nanoid(8)}`;
      db.prepare(
        "INSERT INTO gate_decisions (id, project_id, gate, decision, notes, bible_version, decided_by) VALUES (?, ?, 'treatment', 'sent_back', ?, ?, 'filmmaker')",
      ).run(decisionId, projectId, notes ?? "", treatment.version);

      db.prepare(
        "UPDATE projects SET stage = 'treatment', updated_at = datetime('now') WHERE id = ?",
      ).run(projectId);

      res.json({
        gate: "treatment",
        status: "pending",
        decision: {
          id: decisionId,
          decision: "sent_back",
          notes: notes ?? "",
          decidedBy: "filmmaker",
        },
      });
    }
  });

  return r;
}

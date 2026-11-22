import { Router, type Request, type Response } from "express";
import type Database from "better-sqlite3";
import { nanoid } from "nanoid";
import { askNextQuestion } from "../agents/story.js";

export function projectRoutes(db: Database.Database): Router {
  const r = Router();

  // POST /api/v1/projects — UC-01
  r.post("/", (req: Request, res: Response) => {
    const { idea, options } = req.body ?? {};
    if (!idea || typeof idea !== "string" || idea.trim().length === 0) {
      res.status(400).json({ type: "validation", title: "idea is required" });
      return;
    }

    const id = `prj_${nanoid(8)}`;
    const opts = JSON.stringify(options ?? {});
    const budgetUsd = options?.budgetUsd ?? 25;
    const gates = JSON.stringify({
      story: "pending",
      treatment: "pending",
      lookbook: "pending",
    });

    db.prepare(
      "INSERT INTO projects (id, idea, options, stage, budget_usd, spend_usd, gates) VALUES (?, ?, ?, 'story_interview', ?, 0, ?)",
    ).run(id, idea.trim(), opts, budgetUsd, gates);

    // Story agent produces the first question immediately (fixture)
    const firstQ = askNextQuestion(db, id);

    const project = db
      .prepare("SELECT * FROM projects WHERE id = ?")
      .get(id) as any;

    res.status(201).json({
      id: project.id,
      idea: project.idea,
      options: JSON.parse(project.options),
      stage: project.stage,
      budgetUsd: project.budget_usd,
      spendUsd: project.spend_usd,
      gates: JSON.parse(project.gates),
      firstQuestion: firstQ,
      createdAt: project.created_at,
    });
  });

  // GET /api/v1/projects — list
  r.get("/", (_req: Request, res: Response) => {
    const rows = db
      .prepare("SELECT * FROM projects ORDER BY created_at DESC")
      .all() as any[];

    res.json(
      rows.map((p) => ({
        id: p.id,
        idea: p.idea,
        stage: p.stage,
        spendUsd: p.spend_usd,
        gates: JSON.parse(p.gates),
        createdAt: p.created_at,
      })),
    );
  });

  // GET /api/v1/projects/:id
  r.get("/:id", (req: Request, res: Response) => {
    const row = db
      .prepare("SELECT * FROM projects WHERE id = ?")
      .get(req.params.id) as any;

    if (!row) {
      res.status(404).json({ type: "not_found", title: "Project not found" });
      return;
    }

    res.json({
      id: row.id,
      idea: row.idea,
      options: JSON.parse(row.options),
      stage: row.stage,
      budgetUsd: row.budget_usd,
      spendUsd: row.spend_usd,
      gates: JSON.parse(row.gates),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  });

  return r;
}

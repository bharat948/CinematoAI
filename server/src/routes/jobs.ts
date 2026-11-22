import { Router } from "express";
import type Database from "better-sqlite3";
import { submitJob, runJob, getBudgetSummary } from "../jobs.js";

export function jobRoutes(db: Database.Database): Router {
  const router = Router({ mergeParams: true });

  /** POST / — submit a generation job */
  router.post("/", async (req, res) => {
    const projectId = req.params.id;
    const { agent, medium, prompt } = req.body;
    if (!agent || !medium || !prompt) {
      res.status(400).json({ error: "agent, medium, and prompt are required" });
      return;
    }

    try {
      const result = submitJob(db, { projectId, agent, medium, prompt });

      if (result.status === "reserved") {
        // Run the job inline (in production this would be queued)
        const runResult = await runJob(db, result.jobId);
        res.status(201).json({
          jobId: result.jobId,
          ...runResult,
          budget: getBudgetSummary(db, projectId),
        });
      } else {
        // paused_budget
        res.status(200).json({
          jobId: result.jobId,
          status: result.status,
          budget: getBudgetSummary(db, projectId),
        });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /** GET / — list jobs for this project */
  router.get("/", (req, res) => {
    const projectId = req.params.id;
    const rows = db
      .prepare("SELECT * FROM jobs WHERE project_id = ? ORDER BY created_at")
      .all(projectId) as any[];

    const jobs = rows.map((r) => ({
      id: r.id,
      agent: r.agent,
      medium: r.medium,
      status: r.status,
      costEstimate: r.cost_estimate,
      actualCost: r.actual_cost,
      providerUsed: r.provider_used,
      retries: r.retries,
      error: r.error,
      createdAt: r.created_at,
    }));

    res.json(jobs);
  });

  /** GET /budget — project budget summary */
  router.get("/budget", (req, res) => {
    const projectId = req.params.id;
    try {
      res.json(getBudgetSummary(db, projectId));
    } catch {
      res.status(404).json({ error: "Project not found" });
    }
  });

  /** POST /budget — raise budget */
  router.post("/budget", (req, res) => {
    const projectId = req.params.id;
    const { budgetUsd } = req.body;
    if (typeof budgetUsd !== "number" || budgetUsd <= 0) {
      res.status(400).json({ error: "budgetUsd must be a positive number" });
      return;
    }
    db.prepare("UPDATE projects SET budget_usd = ?, updated_at = datetime('now') WHERE id = ?").run(
      budgetUsd,
      projectId,
    );
    // Un-pause if the new budget allows it
    const project = db.prepare("SELECT stage FROM projects WHERE id = ?").get(projectId) as { stage: string };
    if (project.stage === "paused_budget") {
      db.prepare("UPDATE projects SET stage = 'crew_planning', updated_at = datetime('now') WHERE id = ?").run(
        projectId,
      );
    }
    res.json(getBudgetSummary(db, projectId));
  });

  return router;
}

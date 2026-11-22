import { Router, type Request, type Response } from "express";
import type Database from "better-sqlite3";
import { nanoid } from "nanoid";
import { askNextQuestion, draftBible } from "../agents/story.js";

export function interviewRoutes(db: Database.Database): Router {
  const r = Router({ mergeParams: true });

  // GET /api/v1/projects/:id/interview/messages
  r.get("/messages", (req: Request, res: Response) => {
    const projectId = req.params.id as string;

    const project = db
      .prepare("SELECT id FROM projects WHERE id = ?")
      .get(projectId);
    if (!project) {
      res.status(404).json({ type: "not_found", title: "Project not found" });
      return;
    }

    const rows = db
      .prepare(
        "SELECT id, role, content, round, created_at FROM interview_messages WHERE project_id = ? ORDER BY created_at",
      )
      .all(projectId) as any[];

    res.json(
      rows.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        round: m.round,
        createdAt: m.created_at,
      })),
    );
  });

  // POST /api/v1/projects/:id/interview/messages — user sends an answer
  r.post("/messages", (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const { content } = req.body ?? {};

    if (!content || typeof content !== "string" || content.trim().length === 0) {
      res
        .status(400)
        .json({ type: "validation", title: "content is required" });
      return;
    }

    const project = db
      .prepare("SELECT id, stage FROM projects WHERE id = ?")
      .get(projectId) as any;
    if (!project) {
      res.status(404).json({ type: "not_found", title: "Project not found" });
      return;
    }
    if (project.stage !== "story_interview") {
      res
        .status(409)
        .json({ type: "conflict", title: "Interview is not active" });
      return;
    }

    // Find the current round (the latest agent question's round)
    const lastAgent = db
      .prepare(
        "SELECT round FROM interview_messages WHERE project_id = ? AND role = 'agent' ORDER BY created_at DESC LIMIT 1",
      )
      .get(projectId) as { round: number } | undefined;

    const round = lastAgent?.round ?? 1;

    // Save the user's answer
    const msgId = `msg_${nanoid(8)}`;
    db.prepare(
      "INSERT INTO interview_messages (id, project_id, role, content, round) VALUES (?, ?, 'user', ?, ?)",
    ).run(msgId, projectId, content.trim(), round);

    // Story agent responds with next question (or null if done)
    const nextQ = askNextQuestion(db, projectId);

    // If interview is complete (no more questions), draft the bible and advance stage
    let bible = null;
    if (!nextQ) {
      bible = draftBible(db, projectId);
      if (bible) {
        db.prepare(
          "UPDATE projects SET stage = 'story_review', updated_at = datetime('now') WHERE id = ? AND stage = 'story_interview'",
        ).run(projectId);
      }
    }

    res.status(201).json({
      userMessage: {
        id: msgId,
        role: "user",
        content: content.trim(),
        round,
      },
      agentMessage: nextQ
        ? { id: nextQ.id, role: "agent", content: nextQ.content, round: nextQ.round }
        : null,
      bible: bible
        ? { id: bible.id, version: bible.version }
        : undefined,
    });
  });

  return r;
}

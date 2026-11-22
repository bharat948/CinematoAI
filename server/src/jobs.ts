/**
 * Durable job runner with budget reservations.
 * FR-40: jobs survive restart, resume from last completed step.
 * FR-41: retry + fallback via ProviderChain.
 * FR-42: reserve worst-case cost before call; pause at ceiling.
 */

import type Database from "better-sqlite3";
import crypto from "node:crypto";
import { ProviderChain } from "./providers.js";

export interface JobInput {
  projectId: string;
  agent: string;
  medium: string;
  prompt: string;
}

export interface SubmitResult {
  jobId: string;
  status: string;
  reserved: number | null;
}

/** Registry of provider chains keyed by medium. */
const chains: Map<string, ProviderChain> = new Map();

export function registerChain(medium: string, chain: ProviderChain): void {
  chains.set(medium, chain);
}

export function getChain(medium: string): ProviderChain | undefined {
  return chains.get(medium);
}

export function clearChains(): void {
  chains.clear();
}

/**
 * Submit a job. Reserves budget atomically.
 * Returns immediately — the job runs in the background (or inline for tests).
 */
export function submitJob(db: Database.Database, input: JobInput): SubmitResult {
  const chain = chains.get(input.medium);
  if (!chain) throw new Error(`No provider chain for medium: ${input.medium}`);

  const estimate = chain.estimate(input.medium);
  const jobId = `job_${crypto.randomUUID().slice(0, 8)}`;
  const reservationId = `res_${crypto.randomUUID().slice(0, 8)}`;

  // Atomic: check budget, insert job, insert reservation
  const result = db.transaction(() => {
    const project = db.prepare("SELECT budget_usd, spend_usd FROM projects WHERE id = ?").get(input.projectId) as
      | { budget_usd: number; spend_usd: number }
      | undefined;
    if (!project) throw new Error("Project not found");

    // Sum held reservations
    const held = (
      db.prepare(
        "SELECT COALESCE(SUM(amount_usd), 0) as total FROM budget_reservations WHERE project_id = ? AND status = 'held'",
      ).get(input.projectId) as { total: number }
    ).total;

    const available = project.budget_usd - project.spend_usd - held;
    if (available < estimate) {
      // Cannot reserve — pause project
      db.prepare("UPDATE projects SET stage = 'paused_budget', updated_at = datetime('now') WHERE id = ?").run(
        input.projectId,
      );
      // Insert job as paused_budget
      db.prepare(
        `INSERT INTO jobs (id, project_id, agent, medium, prompt, status, cost_estimate)
         VALUES (?, ?, ?, ?, ?, 'paused_budget', ?)`,
      ).run(jobId, input.projectId, input.agent, input.medium, input.prompt, estimate);
      return { jobId, status: "paused_budget", reserved: null };
    }

    // Insert job first (FK target), then reservation
    db.prepare(
      `INSERT INTO jobs (id, project_id, agent, medium, prompt, status, cost_estimate)
       VALUES (?, ?, ?, ?, ?, 'reserved', ?)`,
    ).run(jobId, input.projectId, input.agent, input.medium, input.prompt, estimate);

    db.prepare(
      `INSERT INTO budget_reservations (id, project_id, job_id, amount_usd, status)
       VALUES (?, ?, ?, ?, 'held')`,
    ).run(reservationId, input.projectId, jobId, estimate);

    return { jobId, status: "reserved", reserved: estimate };
  })();

  return result as SubmitResult;
}

/**
 * Run a reserved job: call provider chain, record spend, release reservation.
 * Idempotent: skips already-completed steps.
 * FR-40: on restart, call runJob again on 'reserved' or 'running' jobs.
 */
export async function runJob(
  db: Database.Database,
  jobId: string,
): Promise<{
  status: string;
  actualCost: number;
  providerUsed: string;
  output: string;
}> {
  const job = db.prepare("SELECT * FROM jobs WHERE id = ?").get(jobId) as any;
  if (!job) throw new Error("Job not found");
  if (job.status === "completed") {
    return {
      status: "completed",
      actualCost: job.actual_cost,
      providerUsed: job.provider_used,
      output: JSON.parse(job.steps).at(-1)?.output ?? "",
    };
  }
  if (job.status === "paused_budget" || job.status === "failed" || job.status === "escalated") {
    return { status: job.status, actualCost: 0, providerUsed: "", output: "" };
  }

  const chain = chains.get(job.medium);
  if (!chain) throw new Error(`No provider chain for medium: ${job.medium}`);

  // Mark running
  db.prepare("UPDATE jobs SET status = 'running', updated_at = datetime('now') WHERE id = ?").run(jobId);

  try {
    const result = await chain.execute(job.medium, job.prompt, job.max_retries);

    // Record completion atomically
    db.transaction(() => {
      const steps = JSON.parse(job.steps);
      steps.push({
        step: steps.length + 1,
        output: result.output,
        cost: result.actualCost,
        provider: result.providerName,
      });

      db.prepare(
        `UPDATE jobs SET status = 'completed', steps = ?, actual_cost = ?,
         provider_used = ?, retries = ?, updated_at = datetime('now') WHERE id = ?`,
      ).run(JSON.stringify(steps), result.actualCost, result.providerName, result.totalRetries, jobId);

      // Update project spend
      db.prepare("UPDATE projects SET spend_usd = spend_usd + ?, updated_at = datetime('now') WHERE id = ?").run(
        result.actualCost,
        job.project_id,
      );

      // Release reservation → spent
      db.prepare(
        "UPDATE budget_reservations SET status = 'spent' WHERE job_id = ? AND status = 'held'",
      ).run(jobId);
    })();

    return {
      status: "completed",
      actualCost: result.actualCost,
      providerUsed: result.providerName,
      output: result.output,
    };
  } catch (err: any) {
    // All providers failed — escalate
    db.transaction(() => {
      db.prepare(
        "UPDATE jobs SET status = 'escalated', error = ?, updated_at = datetime('now') WHERE id = ?",
      ).run(err.message, jobId);

      // Release reservation
      db.prepare(
        "UPDATE budget_reservations SET status = 'released' WHERE job_id = ? AND status = 'held'",
      ).run(jobId);
    })();

    return { status: "escalated", actualCost: 0, providerUsed: "", output: "" };
  }
}

/**
 * Resume all incomplete jobs after restart (FR-40, AC-08).
 * Returns the number of jobs resumed.
 */
export async function resumeJobs(db: Database.Database): Promise<number> {
  const incomplete = db
    .prepare("SELECT id FROM jobs WHERE status IN ('reserved', 'running')")
    .all() as { id: string }[];

  let resumed = 0;
  for (const { id } of incomplete) {
    await runJob(db, id);
    resumed++;
  }
  return resumed;
}

/** Get a project's budget summary. */
export function getBudgetSummary(
  db: Database.Database,
  projectId: string,
): { budgetUsd: number; spendUsd: number; reservedUsd: number; availableUsd: number } {
  const project = db.prepare("SELECT budget_usd, spend_usd FROM projects WHERE id = ?").get(projectId) as {
    budget_usd: number;
    spend_usd: number;
  };
  const held = (
    db.prepare(
      "SELECT COALESCE(SUM(amount_usd), 0) as total FROM budget_reservations WHERE project_id = ? AND status = 'held'",
    ).get(projectId) as { total: number }
  ).total;

  return {
    budgetUsd: project.budget_usd,
    spendUsd: project.spend_usd,
    reservedUsd: held,
    availableUsd: project.budget_usd - project.spend_usd - held,
  };
}

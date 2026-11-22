import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import { openDb } from "./db.js";
import { projectRoutes } from "./routes/projects.js";
import { interviewRoutes } from "./routes/interview.js";
import { gateRoutes } from "./routes/gates.js";
import { cutRoutes } from "./routes/cuts.js";
import { jobRoutes } from "./routes/jobs.js";
import { submitJob, registerChain, clearChains, runJob, resumeJobs } from "./jobs.js";
import { FakeProvider, ProviderChain } from "./providers.js";
import type { Server } from "node:http";
import type Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DB = path.join(__dirname, "..", "test.db");

let db: Database.Database;
let server: Server;
let baseUrl: string;

function buildApp(database: Database.Database) {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/projects", projectRoutes(database));
  app.use("/api/v1/projects/:id/interview", interviewRoutes(database));
  app.use("/api/v1/projects/:id/gates", gateRoutes(database));
  app.use("/api/v1/projects/:id/cuts", cutRoutes(database));
  app.use("/api/v1/projects/:id/jobs", jobRoutes(database));
  return app;
}

beforeEach(async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  db = openDb(TEST_DB);
  const app = buildApp(db);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server.address() as { port: number };
  baseUrl = `http://localhost:${addr.port}`;
});

afterEach(() => {
  server?.close();
  db?.close();
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
});

const LIGHTHOUSE_IDEA =
  "A lighthouse keeper on a drowned coast finds a radio that receives tomorrow's distress calls.";

const ROUND_ANSWERS = [
  "Mara is a retired keeper who wants silence but needs connection. The obstacle is the calls are real. Stakes: a stranger dies.",
  "One call per night, always accurate. Tone: quiet dread. Ending: she saves someone but loses the radio.",
  "Dez, the supply-boat captain. Near-future, sea level risen 2m. The lighthouse must be real, not a metaphor.",
];

/** Create a project and complete all 3 interview rounds. Returns project id. */
async function completeInterview(url: string): Promise<string> {
  const createRes = await fetch(`${url}/api/v1/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idea: LIGHTHOUSE_IDEA }),
  });
  const project = await createRes.json();
  const pid = project.id;

  for (const content of ROUND_ANSWERS) {
    await fetch(`${url}/api/v1/projects/${pid}/interview/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
  }

  return pid;
}

describe("TC-001: Create project from idea", () => {
  it("creates a project in story_interview with first question", async () => {
    const res = await fetch(`${baseUrl}/api/v1/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idea: LIGHTHOUSE_IDEA,
        options: {
          format: "short",
          targetRuntimeMin: 12,
          genreHints: ["mystery", "melancholic sci-fi"],
          budgetUsd: 25,
          autonomy: "collaborative",
        },
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();

    // Project exists in story_interview
    expect(body.id).toMatch(/^prj_/);
    expect(body.stage).toBe("story_interview");
    expect(body.spendUsd).toBe(0);
    expect(body.gates.story).toBe("pending");

    // First interview question appeared
    expect(body.firstQuestion).toBeTruthy();
    expect(body.firstQuestion.role).toBeUndefined(); // returned as {id, content, round}
    expect(body.firstQuestion.content).toContain("protagonist");
    expect(body.firstQuestion.round).toBe(1);
  });

  it("rejects empty idea", async () => {
    const res = await fetch(`${baseUrl}/api/v1/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idea: "" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("TC-014: Interview resumes after restart", () => {
  it("answers 2 rounds, simulates restart, resumes at next unanswered question", async () => {
    // --- Create project ---
    const createRes = await fetch(`${baseUrl}/api/v1/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idea: LIGHTHOUSE_IDEA }),
    });
    const project = await createRes.json();
    const pid = project.id;

    // --- Round 1: answer the first question ---
    const ans1Res = await fetch(
      `${baseUrl}/api/v1/projects/${pid}/interview/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content:
            "Mara is a retired keeper who wants silence but needs connection. The obstacle is the calls are real. Stakes: a stranger dies.",
        }),
      },
    );
    expect(ans1Res.status).toBe(201);
    const ans1Body = await ans1Res.json();
    expect(ans1Body.agentMessage).toBeTruthy();
    expect(ans1Body.agentMessage.round).toBe(2);

    // --- Round 2: answer the second question ---
    const ans2Res = await fetch(
      `${baseUrl}/api/v1/projects/${pid}/interview/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content:
            "One call per night, always accurate. Tone: quiet dread. Ending: she saves someone but loses the radio.",
        }),
      },
    );
    expect(ans2Res.status).toBe(201);
    const ans2Body = await ans2Res.json();
    expect(ans2Body.agentMessage).toBeTruthy();
    expect(ans2Body.agentMessage.round).toBe(3);

    // --- Simulate restart: close server + db, reopen from same file ---
    server.close();
    db.close();

    const db2 = openDb(TEST_DB);
    const app2 = buildApp(db2);
    await new Promise<void>((resolve) => {
      server = app2.listen(0, () => resolve());
    });
    const addr2 = server.address() as { port: number };
    const url2 = `http://localhost:${addr2.port}`;
    db = db2; // for afterEach cleanup

    // --- Fetch interview messages — should have all history ---
    const histRes = await fetch(
      `${url2}/api/v1/projects/${pid}/interview/messages`,
    );
    expect(histRes.status).toBe(200);
    const messages = await histRes.json();

    // 3 agent messages (rounds 1,2,3) + 2 user messages (rounds 1,2) = 5
    expect(messages.length).toBe(5);

    // The last message is the agent's round 3 question (unanswered)
    const last = messages[messages.length - 1];
    expect(last.role).toBe("agent");
    expect(last.round).toBe(3);

    // Project is still in story_interview
    const projRes = await fetch(`${url2}/api/v1/projects/${pid}`);
    const proj = await projRes.json();
    expect(proj.stage).toBe("story_interview");

    // No duplicate messages — each agent message appears exactly once per round
    const agentMsgs = messages.filter((m: any) => m.role === "agent");
    const agentRounds = agentMsgs.map((m: any) => m.round);
    expect(new Set(agentRounds).size).toBe(agentRounds.length);
  });
});

describe("Gate 1: Lock the story", () => {
  it("completing interview drafts bible and moves to story_review", async () => {
    const pid = await completeInterview(baseUrl);

    // Project should be in story_review
    const projRes = await fetch(`${baseUrl}/api/v1/projects/${pid}`);
    const proj = await projRes.json();
    expect(proj.stage).toBe("story_review");

    // Gate summary should have a bible
    const gateRes = await fetch(`${baseUrl}/api/v1/projects/${pid}/gates/story`);
    const gate = await gateRes.json();
    expect(gate.bible).toBeTruthy();
    expect(gate.bible.logline).toContain("lighthouse");
    expect(gate.bible.characters.length).toBeGreaterThanOrEqual(1);
    expect(gate.bible.beatSheet.length).toBeGreaterThanOrEqual(5);
    expect(gate.bible.scenes.length).toBeGreaterThanOrEqual(5);
    expect(gate.status).toBe("pending");
    expect(gate.decision).toBeNull();
  });

  it("approving Gate 1 moves project to director_intake", async () => {
    const pid = await completeInterview(baseUrl);

    const approveRes = await fetch(
      `${baseUrl}/api/v1/projects/${pid}/gates/story`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "approved" }),
      },
    );
    expect(approveRes.status).toBe(200);
    const body = await approveRes.json();
    expect(body.status).toBe("approved");
    expect(body.decision.decidedBy).toBe("filmmaker");

    // Project is now in director_intake
    const projRes = await fetch(`${baseUrl}/api/v1/projects/${pid}`);
    const proj = await projRes.json();
    expect(proj.stage).toBe("treatment_review");
    expect(proj.gates.story).toBe("approved");
  });

  it("approving twice does not advance the project twice (AC-06 idempotency)", async () => {
    const pid = await completeInterview(baseUrl);

    // First approval
    await fetch(`${baseUrl}/api/v1/projects/${pid}/gates/story`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "approved" }),
    });

    // Second approval — should return alreadyApproved
    const res2 = await fetch(`${baseUrl}/api/v1/projects/${pid}/gates/story`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "approved" }),
    });
    const body2 = await res2.json();
    expect(body2.alreadyApproved).toBe(true);
    expect(body2.status).toBe("approved");

    // Stage is still director_intake, not beyond
    const projRes = await fetch(`${baseUrl}/api/v1/projects/${pid}`);
    const proj = await projRes.json();
    expect(proj.stage).toBe("treatment_review");
  });

  it("approval survives restart (FR-30 persistence)", async () => {
    const pid = await completeInterview(baseUrl);

    // Approve
    await fetch(`${baseUrl}/api/v1/projects/${pid}/gates/story`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "approved" }),
    });

    // Restart
    server.close();
    db.close();
    const db2 = openDb(TEST_DB);
    const app2 = buildApp(db2);
    await new Promise<void>((resolve) => {
      server = app2.listen(0, () => resolve());
    });
    const addr2 = server.address() as { port: number };
    const url2 = `http://localhost:${addr2.port}`;
    db = db2;

    // Check persisted state
    const projRes = await fetch(`${url2}/api/v1/projects/${pid}`);
    const proj = await projRes.json();
    expect(proj.stage).toBe("treatment_review");
    expect(proj.gates.story).toBe("approved");

    // Gate endpoint confirms the decision
    const gateRes = await fetch(`${url2}/api/v1/projects/${pid}/gates/story`);
    const gate = await gateRes.json();
    expect(gate.decision).toBeTruthy();
    expect(gate.decision.decision).toBe("approved");
    expect(gate.bible).toBeTruthy();
  });

  it("send-back returns project to story_interview", async () => {
    const pid = await completeInterview(baseUrl);

    const res = await fetch(`${baseUrl}/api/v1/projects/${pid}/gates/story`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decision: "sent_back",
        notes: "Make the ending ambiguous",
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("pending");
    expect(body.decision.decision).toBe("sent_back");
    expect(body.decision.notes).toBe("Make the ending ambiguous");

    // Project returned to story_interview
    const projRes = await fetch(`${baseUrl}/api/v1/projects/${pid}`);
    const proj = await projRes.json();
    expect(proj.stage).toBe("story_interview");
  });
});

/** Approve Gate 1 and reach treatment_review. Returns project id. */
async function approveGate1(url: string): Promise<string> {
  const pid = await completeInterview(url);
  await fetch(`${url}/api/v1/projects/${pid}/gates/story`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision: "approved" }),
  });
  return pid;
}

describe("Gate 2: Choose a reading", () => {
  it("Gate 1 approval produces a treatment with two readings", async () => {
    const pid = await approveGate1(baseUrl);

    const gateRes = await fetch(
      `${baseUrl}/api/v1/projects/${pid}/gates/treatment`,
    );
    expect(gateRes.status).toBe(200);
    const gate = await gateRes.json();

    expect(gate.treatment).toBeTruthy();
    expect(gate.treatment.toneWords.length).toBeGreaterThanOrEqual(3);
    expect(gate.treatment.readings.length).toBe(2);

    // Both readings have panels and differ in who-knows-what
    const [a, b] = gate.treatment.readings;
    expect(a.key).toBe("discover_with_mara");
    expect(b.key).toBe("audience_knows_first");
    expect(a.panels.length).toBeGreaterThanOrEqual(4);
    expect(b.panels.length).toBeGreaterThanOrEqual(4);
    expect(a.brief.whoKnowsWhat).not.toBe(b.brief.whoKnowsWhat);

    // Which shot reveals the date first differs between readings
    const aRevealPanel = a.panels.find((p: any) => p.revealsDate);
    const bRevealPanel = b.panels.find((p: any) => p.revealsDate);
    expect(aRevealPanel).toBeTruthy();
    expect(bRevealPanel).toBeTruthy();
    expect(aRevealPanel.panel).not.toBe(bRevealPanel.panel);

    // Look tests and sound sketch present
    expect(gate.treatment.lookTests.length).toBe(4);
    expect(gate.treatment.soundSketch.duration).toBe("30 seconds");

    // No selection yet
    expect(gate.selectedReading).toBeNull();
  });

  it("filmmaker selects a reading and approves Gate 2", async () => {
    const pid = await approveGate1(baseUrl);

    const res = await fetch(
      `${baseUrl}/api/v1/projects/${pid}/gates/treatment`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: "approved",
          selectedReading: "discover_with_mara",
        }),
      },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("approved");
    expect(body.selectedReading.readingKey).toBe("discover_with_mara");

    // Project advanced to crew_planning
    const projRes = await fetch(`${baseUrl}/api/v1/projects/${pid}`);
    const proj = await projRes.json();
    expect(proj.stage).toBe("crew_planning");
    expect(proj.gates.treatment).toBe("approved");
  });

  it("approval requires a valid reading selection", async () => {
    const pid = await approveGate1(baseUrl);

    // No reading
    const res1 = await fetch(
      `${baseUrl}/api/v1/projects/${pid}/gates/treatment`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "approved" }),
      },
    );
    expect(res1.status).toBe(400);

    // Invalid reading key
    const res2 = await fetch(
      `${baseUrl}/api/v1/projects/${pid}/gates/treatment`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: "approved",
          selectedReading: "nonexistent",
        }),
      },
    );
    expect(res2.status).toBe(400);
  });

  it("selecting each reading on separate runs works", async () => {
    // Run 1: select reading A
    const pid1 = await approveGate1(baseUrl);
    const res1 = await fetch(
      `${baseUrl}/api/v1/projects/${pid1}/gates/treatment`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: "approved",
          selectedReading: "discover_with_mara",
        }),
      },
    );
    const body1 = await res1.json();
    expect(body1.selectedReading.readingKey).toBe("discover_with_mara");

    // Run 2: select reading B
    const pid2 = await approveGate1(baseUrl);
    const res2 = await fetch(
      `${baseUrl}/api/v1/projects/${pid2}/gates/treatment`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: "approved",
          selectedReading: "audience_knows_first",
        }),
      },
    );
    const body2 = await res2.json();
    expect(body2.selectedReading.readingKey).toBe("audience_knows_first");
  });

  it("selection survives restart", async () => {
    const pid = await approveGate1(baseUrl);

    await fetch(`${baseUrl}/api/v1/projects/${pid}/gates/treatment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decision: "approved",
        selectedReading: "audience_knows_first",
      }),
    });

    // Restart
    server.close();
    db.close();
    const db2 = openDb(TEST_DB);
    const app2 = buildApp(db2);
    await new Promise<void>((resolve) => {
      server = app2.listen(0, () => resolve());
    });
    const addr2 = server.address() as { port: number };
    const url2 = `http://localhost:${addr2.port}`;
    db = db2;

    // Check persisted state
    const projRes = await fetch(`${url2}/api/v1/projects/${pid}`);
    const proj = await projRes.json();
    expect(proj.stage).toBe("crew_planning");
    expect(proj.gates.treatment).toBe("approved");

    const gateRes = await fetch(
      `${url2}/api/v1/projects/${pid}/gates/treatment`,
    );
    const gate = await gateRes.json();
    expect(gate.selectedReading).toBeTruthy();
    expect(gate.selectedReading.readingKey).toBe("audience_knows_first");
    expect(gate.treatment).toBeTruthy();
    expect(gate.treatment.readings.length).toBe(2);
  });

  it("approving twice is idempotent", async () => {
    const pid = await approveGate1(baseUrl);

    await fetch(`${baseUrl}/api/v1/projects/${pid}/gates/treatment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decision: "approved",
        selectedReading: "discover_with_mara",
      }),
    });

    const res2 = await fetch(
      `${baseUrl}/api/v1/projects/${pid}/gates/treatment`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: "approved",
          selectedReading: "discover_with_mara",
        }),
      },
    );
    const body2 = await res2.json();
    expect(body2.alreadyApproved).toBe(true);
    expect(body2.status).toBe("approved");

    const projRes = await fetch(`${baseUrl}/api/v1/projects/${pid}`);
    const proj = await projRes.json();
    expect(proj.stage).toBe("crew_planning");
  });

  it("send-back returns project to treatment stage", async () => {
    const pid = await approveGate1(baseUrl);

    const res = await fetch(
      `${baseUrl}/api/v1/projects/${pid}/gates/treatment`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: "sent_back",
          notes: "Make reading A more suspenseful",
        }),
      },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.decision.decision).toBe("sent_back");

    const projRes = await fetch(`${baseUrl}/api/v1/projects/${pid}`);
    const proj = await projRes.json();
    expect(proj.stage).toBe("treatment");
  });
});

/** Approve Gate 2 with a reading and reach crew_planning. Returns {pid, readingKey}. */
async function approveGate2(
  url: string,
  readingKey = "discover_with_mara",
): Promise<{ pid: string; readingKey: string }> {
  const pid = await approveGate1(url);
  await fetch(`${url}/api/v1/projects/${pid}/gates/treatment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision: "approved", selectedReading: readingKey }),
  });
  return { pid, readingKey };
}

describe("WO#4: Watch the choice — animatic and cuts", () => {
  it("builds a cut from the selected reading with EDL and cues", async () => {
    const { pid, readingKey } = await approveGate2(baseUrl);

    const buildRes = await fetch(`${baseUrl}/api/v1/projects/${pid}/cuts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ readingKey }),
    });
    expect(buildRes.status).toBe(201);
    const cut = await buildRes.json();

    expect(cut.id).toMatch(/^cut_/);
    expect(cut.fps).toBe(24);
    expect(cut.edl.length).toBeGreaterThanOrEqual(4);
    expect(cut.cues.length).toBeGreaterThanOrEqual(2);
    expect(cut.durationSeconds).toBeGreaterThan(10);
    expect(cut.isCurrent).toBe(true);

    // Every EDL entry has frame timings
    for (const entry of cut.edl) {
      expect(entry.shotId).toMatch(/^shot_/);
      expect(entry.frameOut).toBeGreaterThan(entry.frameIn);
      expect(entry.durationFrames).toBeGreaterThan(0);
    }

    // At least one caption references the date reveal
    const hasDateCaption = cut.edl.some(
      (e: any) => e.caption.includes("NOV") || e.caption.includes("23"),
    );
    expect(hasDateCaption).toBe(true);
  });

  it("builds cuts for both readings", async () => {
    const { pid } = await approveGate2(baseUrl, "discover_with_mara");

    // Build reading A
    await fetch(`${baseUrl}/api/v1/projects/${pid}/cuts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ readingKey: "discover_with_mara" }),
    });

    // Build reading B
    await fetch(`${baseUrl}/api/v1/projects/${pid}/cuts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ readingKey: "audience_knows_first" }),
    });

    const cutA = await fetch(
      `${baseUrl}/api/v1/projects/${pid}/cuts?reading=discover_with_mara`,
    ).then((r) => r.json());
    const cutB = await fetch(
      `${baseUrl}/api/v1/projects/${pid}/cuts?reading=audience_knows_first`,
    ).then((r) => r.json());

    expect(cutA.readingKey).toBe("discover_with_mara");
    expect(cutB.readingKey).toBe("audience_knows_first");
    // Different number of panels = different EDL lengths
    expect(cutA.edl.length).not.toBe(cutB.edl.length);
  });

  it("TC-102: replacing a shot flags 2 neighbours each side and spanning cues", async () => {
    const { pid, readingKey } = await approveGate2(baseUrl);

    // Build the cut
    const buildRes = await fetch(`${baseUrl}/api/v1/projects/${pid}/cuts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ readingKey }),
    });
    const cut = await buildRes.json();

    // Pick a middle shot (index 2 in a 5-panel reading) to replace
    const middleShot = cut.edl[2];

    const replaceRes = await fetch(
      `${baseUrl}/api/v1/projects/${pid}/cuts/replace-shot`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          readingKey,
          shotId: middleShot.shotId,
          description: "Updated panel description",
          durationFrames: middleShot.durationFrames + 24, // lengthen by 1s
        }),
      },
    );
    expect(replaceRes.status).toBe(200);
    const result = await replaceRes.json();

    // New cut version created
    expect(result.cut.version).toBe(2);
    expect(result.cut.isCurrent).toBe(true);

    // Flagged shots: 2 on each side of index 2 → indices 0, 1, 3, 4
    expect(result.flaggedShots.length).toBe(4);

    // Flags include spanning cue flags
    expect(result.flags.length).toBeGreaterThanOrEqual(4);

    // Old cut is no longer current
    const history = await fetch(
      `${baseUrl}/api/v1/projects/${pid}/cuts/history?reading=${readingKey}`,
    ).then((r) => r.json());
    expect(history.length).toBe(2);
    expect(history[0].version).toBe(2);
    expect(history[0].isCurrent).toBe(true);
    expect(history[1].version).toBe(1);
    expect(history[1].isCurrent).toBe(false);
  });

  it("timed notes require shot ID, timecode, and owner (AG-DIR-13)", async () => {
    const { pid, readingKey } = await approveGate2(baseUrl);

    const buildRes = await fetch(`${baseUrl}/api/v1/projects/${pid}/cuts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ readingKey }),
    });
    const cut = await buildRes.json();

    // Missing ownerAgent → rejected
    const badRes = await fetch(`${baseUrl}/api/v1/projects/${pid}/cuts/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cutId: cut.id,
        shotId: cut.edl[0].shotId,
        tcIn: "00:00:00:00",
        tcOut: "00:00:03:00",
        observation: "Music swells too early",
      }),
    });
    expect(badRes.status).toBe(400);

    // Valid note
    const goodRes = await fetch(
      `${baseUrl}/api/v1/projects/${pid}/cuts/notes`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cutId: cut.id,
          shotId: cut.edl[0].shotId,
          tcIn: "00:00:00:00",
          tcOut: "00:00:03:00",
          observation: "Music swells too early before the reveal",
          intended: "Silence — dread builds from absence",
          gap: "Score entry undercuts the tension",
          ownerAgent: "composer",
          experiment: "Delay cello entry by 12 frames",
          priority: "high",
        }),
      },
    );
    expect(goodRes.status).toBe(201);
    const note = await goodRes.json();
    expect(note.id).toMatch(/^note_/);
    expect(note.ownerAgent).toBe("composer");
    expect(note.status).toBe("open");

    // Retrieve notes
    const listRes = await fetch(
      `${baseUrl}/api/v1/projects/${pid}/cuts/notes?cutId=${cut.id}`,
    );
    const notes = await listRes.json();
    expect(notes.length).toBe(1);
    expect(notes[0].shotId).toBe(cut.edl[0].shotId);
  });

  it("cut survives restart", async () => {
    const { pid, readingKey } = await approveGate2(baseUrl);

    await fetch(`${baseUrl}/api/v1/projects/${pid}/cuts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ readingKey }),
    });

    // Restart
    server.close();
    db.close();
    const db2 = openDb(TEST_DB);
    const app2 = buildApp(db2);
    await new Promise<void>((resolve) => {
      server = app2.listen(0, () => resolve());
    });
    const addr2 = server.address() as { port: number };
    const url2 = `http://localhost:${addr2.port}`;
    db = db2;

    const cutRes = await fetch(
      `${url2}/api/v1/projects/${pid}/cuts?reading=${readingKey}`,
    );
    expect(cutRes.status).toBe(200);
    const cut = await cutRes.json();
    expect(cut.edl.length).toBeGreaterThanOrEqual(4);
    expect(cut.fps).toBe(24);
    expect(cut.isCurrent).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// WO#5: Recover a billable job — reservations, retries, recovery
// ---------------------------------------------------------------------------

/** Create a project with a specific budget (USD). */
async function createProjectWithBudget(
  url: string,
  budgetUsd: number,
): Promise<string> {
  const res = await fetch(`${url}/api/v1/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      idea: LIGHTHOUSE_IDEA,
      options: { budgetUsd },
    }),
  });
  const body = await res.json();
  return body.id;
}

describe("WO#5: Budget reservations and spend tracking (FR-42, AC-10, TC-060)", () => {
  beforeEach(() => {
    clearChains();
    registerChain(
      "image",
      new ProviderChain([new FakeProvider({ name: "fake-img", costPerCall: 0.50 })]),
    );
  });

  it("reserves budget before a job and records spend on completion", async () => {
    const pid = await createProjectWithBudget(baseUrl, 5);

    const res = await fetch(`${baseUrl}/api/v1/projects/${pid}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent: "storyboard", medium: "image", prompt: "lighthouse at dawn" }),
    });
    expect(res.status).toBe(201);
    const job = await res.json();

    expect(job.status).toBe("completed");
    expect(job.actualCost).toBe(0.50);
    expect(job.providerUsed).toBe("fake-img");
    expect(job.budget.spendUsd).toBe(0.50);
    expect(job.budget.availableUsd).toBe(4.50);
  });

  it("TC-060: budget USD 2, run to exhaustion → paused_budget, spend ≤ USD 2", async () => {
    const pid = await createProjectWithBudget(baseUrl, 2);

    // Each job costs $0.50 → 4 jobs max, 5th should be paused
    const results = [];
    for (let i = 0; i < 5; i++) {
      const res = await fetch(`${baseUrl}/api/v1/projects/${pid}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent: "storyboard",
          medium: "image",
          prompt: `panel ${i + 1}`,
        }),
      });
      results.push(await res.json());
    }

    // First 4 complete
    for (let i = 0; i < 4; i++) {
      expect(results[i].status).toBe("completed");
    }

    // 5th is paused
    expect(results[4].status).toBe("paused_budget");

    // Project is paused_budget
    const projRes = await fetch(`${baseUrl}/api/v1/projects/${pid}`);
    const proj = await projRes.json();
    expect(proj.stage).toBe("paused_budget");
    expect(proj.spendUsd).toBeLessThanOrEqual(2.0);
    expect(proj.spendUsd).toBe(2.0); // exactly 4 × $0.50
  });

  it("AC-10: spend never exceeds budget, project shows paused_budget", async () => {
    const pid = await createProjectWithBudget(baseUrl, 5);

    // Run 10 jobs at $0.50 each — only 10 fit in $5
    const results = [];
    for (let i = 0; i < 12; i++) {
      const res = await fetch(`${baseUrl}/api/v1/projects/${pid}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent: "storyboard",
          medium: "image",
          prompt: `panel ${i + 1}`,
        }),
      });
      results.push(await res.json());
    }

    const completed = results.filter((r) => r.status === "completed");
    const paused = results.filter((r) => r.status === "paused_budget");
    expect(completed.length).toBe(10);
    expect(paused.length).toBe(2);

    // Final spend ≤ budget
    const budgetRes = await fetch(`${baseUrl}/api/v1/projects/${pid}/jobs/budget`);
    const budget = await budgetRes.json();
    expect(budget.spendUsd).toBeLessThanOrEqual(5.0);
    expect(budget.spendUsd).toBe(5.0);
  });

  it("race: two parallel requests for remaining budget — one wins, one pauses", async () => {
    // Budget $0.50 — exactly one job
    const pid = await createProjectWithBudget(baseUrl, 0.50);

    // Fire two requests simultaneously
    const [res1, res2] = await Promise.all([
      fetch(`${baseUrl}/api/v1/projects/${pid}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent: "storyboard", medium: "image", prompt: "panel A" }),
      }),
      fetch(`${baseUrl}/api/v1/projects/${pid}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent: "storyboard", medium: "image", prompt: "panel B" }),
      }),
    ]);

    const body1 = await res1.json();
    const body2 = await res2.json();

    const statuses = [body1.status, body2.status].sort();
    expect(statuses).toEqual(["completed", "paused_budget"]);

    // Spend ≤ budget
    const budgetRes = await fetch(`${baseUrl}/api/v1/projects/${pid}/jobs/budget`);
    const budget = await budgetRes.json();
    expect(budget.spendUsd).toBeLessThanOrEqual(0.50);
  });

  it("raising the budget un-pauses the project", async () => {
    const pid = await createProjectWithBudget(baseUrl, 0.50);

    // Exhaust budget
    await fetch(`${baseUrl}/api/v1/projects/${pid}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent: "storyboard", medium: "image", prompt: "panel 1" }),
    });
    await fetch(`${baseUrl}/api/v1/projects/${pid}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent: "storyboard", medium: "image", prompt: "panel 2" }),
    });

    let proj = await fetch(`${baseUrl}/api/v1/projects/${pid}`).then((r) => r.json());
    expect(proj.stage).toBe("paused_budget");

    // Raise budget
    await fetch(`${baseUrl}/api/v1/projects/${pid}/jobs/budget`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ budgetUsd: 5 }),
    });

    proj = await fetch(`${baseUrl}/api/v1/projects/${pid}`).then((r) => r.json());
    expect(proj.stage).not.toBe("paused_budget");
  });
});

describe("WO#5: Retry and fallback (FR-41, AC-09)", () => {
  beforeEach(() => {
    clearChains();
  });

  it("AC-09: retries 3 times on primary then succeeds on fallback", async () => {
    const primary = new FakeProvider({ name: "primary-img", costPerCall: 0.50, failCount: 999 });
    const fallback = new FakeProvider({ name: "fallback-img", costPerCall: 0.60 });
    registerChain("image", new ProviderChain([primary, fallback]));

    const pid = await createProjectWithBudget(baseUrl, 5);

    const res = await fetch(`${baseUrl}/api/v1/projects/${pid}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent: "storyboard", medium: "image", prompt: "lighthouse at dawn" }),
    });
    const job = await res.json();

    expect(job.status).toBe("completed");
    expect(job.providerUsed).toBe("fallback-img");
    expect(job.actualCost).toBe(0.60);
  });

  it("escalates when all providers fail", async () => {
    const provider = new FakeProvider({ name: "broken-img", costPerCall: 0.50, failCount: 999 });
    registerChain("image", new ProviderChain([provider]));

    const pid = await createProjectWithBudget(baseUrl, 5);

    const res = await fetch(`${baseUrl}/api/v1/projects/${pid}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent: "storyboard", medium: "image", prompt: "lighthouse at dawn" }),
    });
    const job = await res.json();

    expect(job.status).toBe("escalated");

    // No spend charged
    const budget = await fetch(`${baseUrl}/api/v1/projects/${pid}/jobs/budget`).then((r) => r.json());
    expect(budget.spendUsd).toBe(0);
  });
});

describe("WO#5: Durable jobs — restart recovery (FR-40, AC-08)", () => {
  beforeEach(() => {
    clearChains();
    registerChain(
      "image",
      new ProviderChain([new FakeProvider({ name: "fake-img", costPerCall: 0.50 })]),
    );
  });

  it("AC-08: completed jobs survive restart with no duplicate charges", async () => {
    const pid = await createProjectWithBudget(baseUrl, 5);

    // Run 3 jobs
    for (let i = 0; i < 3; i++) {
      await fetch(`${baseUrl}/api/v1/projects/${pid}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent: "storyboard", medium: "image", prompt: `panel ${i}` }),
      });
    }

    // Restart
    server.close();
    db.close();
    const db2 = openDb(TEST_DB);
    const app2 = buildApp(db2);
    await new Promise<void>((resolve) => {
      server = app2.listen(0, () => resolve());
    });
    const addr2 = server.address() as { port: number };
    const url2 = `http://localhost:${addr2.port}`;
    db = db2;

    // Resume jobs (should be a no-op since all completed)
    const resumed = await resumeJobs(db2);
    expect(resumed).toBe(0);

    // Verify spend is preserved
    const proj = await fetch(`${url2}/api/v1/projects/${pid}`).then((r) => r.json());
    expect(proj.spendUsd).toBe(1.50); // 3 × $0.50

    // Jobs are all still completed
    const jobs = await fetch(`${url2}/api/v1/projects/${pid}/jobs`).then((r) => r.json());
    expect(jobs.length).toBe(3);
    expect(jobs.every((j: any) => j.status === "completed")).toBe(true);
  });

  it("AC-08: running job resumes after restart without duplicate charges", async () => {
    const pid = await createProjectWithBudget(baseUrl, 5);

    // Simulate a job that was reserved but never ran (service crashed after reservation)
    const result = submitJob(db, {
      projectId: pid,
      agent: "storyboard",
      medium: "image",
      prompt: "interrupted panel",
    });
    expect(result.status).toBe("reserved");

    // Restart
    server.close();
    db.close();
    const db2 = openDb(TEST_DB);
    const app2 = buildApp(db2);
    await new Promise<void>((resolve) => {
      server = app2.listen(0, () => resolve());
    });
    const addr2 = server.address() as { port: number };
    const url2 = `http://localhost:${addr2.port}`;
    db = db2;

    // Resume picks up the reserved job
    const resumed = await resumeJobs(db2);
    expect(resumed).toBe(1);

    // Job is now complete
    const jobs = await fetch(`${url2}/api/v1/projects/${pid}/jobs`).then((r) => r.json());
    expect(jobs.length).toBe(1);
    expect(jobs[0].status).toBe("completed");
    expect(jobs[0].actualCost).toBe(0.50);

    // Spend recorded exactly once
    const proj = await fetch(`${url2}/api/v1/projects/${pid}`).then((r) => r.json());
    expect(proj.spendUsd).toBe(0.50);
  });
});

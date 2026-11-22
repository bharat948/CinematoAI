/**
 * Story agent stub — fixture-based for the local pilot.
 * Generates interview questions without calling an LLM.
 * Label: FIXTURE (no live provider spend).
 */

import type Database from "better-sqlite3";
import { nanoid } from "nanoid";

interface ProjectRow {
  id: string;
  idea: string;
  options: string;
}

interface MessageRow {
  id: string;
  role: string;
  content: string;
  round: number;
}

/** Coverage checklist items the story agent tracks. */
const CHECKLIST = [
  "premise",
  "protagonist_want_need",
  "antagonist_obstacle",
  "stakes",
  "world_rules",
  "tone",
  "ending",
  "supporting_characters",
] as const;

/** Fixture questions per round (3–5 per round per AG-STY). */
const ROUND_QUESTIONS: Record<number, (idea: string) => string> = {
  1: (idea) =>
    `I hear this: "${idea}"\n\n` +
    `Let me develop that into a full story. Here are my first questions:\n\n` +
    `1. **Who is the protagonist?** What do they want most, and what do they actually need? ` +
    `(e.g. "A retired keeper who wants silence but needs connection" / "A young engineer posted here as punishment")\n\n` +
    `2. **What is the central obstacle or antagonist?** ` +
    `(e.g. "The calls are real and ignoring them means someone drowns tomorrow" / "A bureaucracy that shut the coast down and doesn't believe her")\n\n` +
    `3. **What are the stakes if the protagonist fails?** ` +
    `(e.g. "A stranger dies and she carries it" / "The coast stays closed and the community starves")`,
  2: (_idea) =>
    `Good — the shape is clearer. Next round:\n\n` +
    `1. **What are the rules of the world?** How does the radio work — does it always predict, or is it unreliable? ` +
    `(e.g. "One call per night, always accurate" / "Sporadic, sometimes the future changes")\n\n` +
    `2. **What is the tone?** ` +
    `(e.g. "Quiet dread — like The Lighthouse meets Arrival" / "Melancholy hope — like Station Eleven")\n\n` +
    `3. **How does it end?** ` +
    `(e.g. "She saves someone but loses the radio" / "She realises the voice is her own from the future")`,
  3: (_idea) =>
    `Almost there. Final gaps:\n\n` +
    `1. **Are there key supporting characters?** ` +
    `(e.g. "A supply-boat captain who is her only link to shore" / "A voice on the radio she starts to know")\n\n` +
    `2. **Any world-building details you care about?** Era, technology level, geography? ` +
    `(e.g. "Near-future, sea level has risen 2 m, analog tech still works" / "Contemporary but isolated, no cell signal")\n\n` +
    `3. **Anything I must not change about your idea?** ` +
    `(e.g. "The lighthouse must be real, not a metaphor" / "No happy ending")`,
};

const MAX_ROUND = Object.keys(ROUND_QUESTIONS).length;

/** Determine the current interview round from existing messages. */
export function currentRound(messages: MessageRow[]): number {
  if (messages.length === 0) return 0;
  return Math.max(...messages.map((m) => m.round));
}

/** Count completed rounds (agent asked + user answered). */
export function completedRounds(messages: MessageRow[]): number {
  const rounds = new Set<number>();
  const agentRounds = new Set<number>();
  const userRounds = new Set<number>();
  for (const m of messages) {
    if (m.role === "agent") agentRounds.add(m.round);
    if (m.role === "user") userRounds.add(m.round);
  }
  for (const r of agentRounds) {
    if (userRounds.has(r)) rounds.add(r);
  }
  return rounds.size;
}

/** Generate the next agent message for a project. Returns null if interview is complete. */
export function generateNextQuestion(
  project: ProjectRow,
  messages: MessageRow[],
): string | null {
  const done = completedRounds(messages);
  const nextRound = done + 1;

  if (nextRound > MAX_ROUND) {
    return null; // Interview complete — ready for bible draft
  }

  // Check if the agent already asked this round's question
  const alreadyAsked = messages.some(
    (m) => m.role === "agent" && m.round === nextRound,
  );
  if (alreadyAsked) return null;

  const questionFn = ROUND_QUESTIONS[nextRound];
  if (!questionFn) return null;

  return questionFn(project.idea);
}

/** Bible section types matching FR-10 (subset for Gate 1). */
export interface StoryBible {
  id: string;
  projectId: string;
  version: number;
  logline: string;
  synopsis: string;
  themes: string[];
  worldRules: string;
  characters: CharacterProfile[];
  beatSheet: Beat[];
  scenes: Scene[];
}

interface CharacterProfile {
  name: string;
  age: string;
  want: string;
  need: string;
  flaw: string;
  arc: string;
  lookNotes: string;
}

interface Beat {
  beat: string;
  description: string;
}

interface Scene {
  number: number;
  location: string;
  timeOfDay: string;
  characters: string[];
  purpose: string;
  mood: string;
}

/**
 * Draft a story bible from the interview answers.
 * FIXTURE — builds a deterministic bible from the lighthouse pilot.
 * Label: FIXTURE (no live provider spend).
 */
export function draftBible(
  db: Database.Database,
  projectId: string,
): StoryBible | null {
  const project = db
    .prepare("SELECT id, idea, options FROM projects WHERE id = ?")
    .get(projectId) as ProjectRow | undefined;
  if (!project) return null;

  const messages = db
    .prepare(
      "SELECT id, role, content, round FROM interview_messages WHERE project_id = ? ORDER BY created_at",
    )
    .all(projectId) as MessageRow[];

  const done = completedRounds(messages);
  if (done < MAX_ROUND) return null;

  // Check if a bible already exists for this project
  const existing = db
    .prepare(
      "SELECT id FROM story_bibles WHERE project_id = ? ORDER BY version DESC LIMIT 1",
    )
    .get(projectId) as { id: string } | undefined;
  if (existing) return getBible(db, existing.id);

  // Determine next version
  const lastVersion = db
    .prepare(
      "SELECT MAX(version) as v FROM story_bibles WHERE project_id = ?",
    )
    .get(projectId) as { v: number | null };
  const version = (lastVersion?.v ?? 0) + 1;

  const bible: Omit<StoryBible, "id"> = {
    projectId,
    version,
    logline:
      "A lighthouse keeper on a drowned coast discovers a radio that receives tomorrow's distress calls — and must choose between the silence she craves and the strangers she can save.",
    synopsis:
      "Mara, a retired keeper, retreats to an automated lighthouse on a coast half-claimed by rising seas. She wants silence after years of loss; she needs connection she won't admit to.\n\nOne night the emergency radio — disconnected for years — crackles to life with a distress call timestamped tomorrow. She dismisses it as interference. The next day a fishing boat capsizes at the exact coordinates. A body washes ashore.\n\nThe calls keep coming: one per night, always accurate, always one life at stake. Mara begins responding — launching the tender, radioing the coast guard with coordinates she can't explain. The supply-boat captain, Dez, her only link to shore, notices the impossible rescues and starts asking questions.\n\nEach save costs Mara something: sleep, credibility, the solitude she built her life around. She tries to record the calls; the recordings are blank. She tries to ignore one; the guilt is worse than the effort.\n\nWhen the radio finally broadcasts a call with her own voice — her own distress, her own coordinates, tomorrow's date — Mara faces the question the radio has been asking all along: is a life worth saving only when it isn't yours?\n\nShe launches the tender into the storm. The radio goes silent. Dez finds her alive on the rocks at dawn. The radio never transmits again. Mara stays at the lighthouse — but she leaves the door unlocked.",
    themes: [
      "Isolation vs. connection",
      "The cost of caring",
      "Whether saving others can save yourself",
    ],
    worldRules:
      "Near-future, sea level risen ~2 m. Analog tech still works; digital is spotty. The radio receives one call per night, always accurate, always one life. Recordings come out blank. The mechanism is never explained — it simply is.",
    characters: [
      {
        name: "Mara",
        age: "Late 50s",
        want: "Silence and solitude",
        need: "Connection — to feel that saving someone matters, including herself",
        flaw: "Believes withdrawal is strength; treats isolation as earned, not chosen",
        arc: "From self-exile to reluctant guardian to someone who leaves the door unlocked",
        lookNotes:
          "Weathered, practical clothes. Calloused hands. Moves economically. Face shows more in stillness than expression.",
      },
      {
        name: "Dez",
        age: "Mid 40s",
        want: "To understand what Mara is doing",
        need: "To trust someone who doesn't explain themselves",
        flaw: "Pushes for answers when patience would work better",
        arc: "From suspicious observer to reluctant accomplice to the one who finds her",
        lookNotes:
          "Supply-boat captain. Sun-dark skin, salt-stiff jacket. Hands always busy. Speaks in short sentences.",
      },
    ],
    beatSheet: [
      { beat: "Opening image", description: "Mara alone at the lighthouse, checking the automated lamp. Sea fog. Silence." },
      { beat: "Setup", description: "Daily routine: weather log, supplies from Dez's boat, no radio, no visitors. She likes it." },
      { beat: "Catalyst", description: "The dead radio crackles. A distress call timestamped tomorrow, 02:17." },
      { beat: "Debate", description: "She dismisses it. Next day a boat capsizes at those coordinates. A body." },
      { beat: "Break into two", description: "Second call. She takes the tender out. Saves a kayaker. Tells no one." },
      { beat: "B-story", description: "Dez notices fuel usage, odd timing. He starts asking. Mara deflects." },
      { beat: "Midpoint", description: "Three rescues in. Coast guard logs match. Dez confronts her; she shows him the radio. It stays silent in his presence." },
      { beat: "Bad guys close in", description: "She tries to record a call — blank. Tries to ignore one — the guilt breaks her sleep." },
      { beat: "All is lost", description: "The radio broadcasts her own voice, her own coordinates, tomorrow." },
      { beat: "Dark night of the soul", description: "She sits with the question: does she go?" },
      { beat: "Break into three", description: "She goes. Launches into the storm." },
      { beat: "Finale", description: "Dez finds her alive at dawn. The radio is dead. She stays. Door unlocked." },
      { beat: "Final image", description: "Same lighthouse, same fog — but the door is open and there are two cups on the table." },
    ],
    scenes: [
      { number: 1, location: "Lighthouse exterior / lantern room", timeOfDay: "Dusk", characters: ["Mara"], purpose: "Opening image — establish isolation", mood: "Still, grey" },
      { number: 2, location: "Lighthouse interior / kitchen", timeOfDay: "Morning", characters: ["Mara"], purpose: "Setup routine", mood: "Quiet, controlled" },
      { number: 3, location: "Jetty", timeOfDay: "Midday", characters: ["Mara", "Dez"], purpose: "Introduce Dez, supply exchange", mood: "Businesslike, brief warmth" },
      { number: 4, location: "Radio room", timeOfDay: "Night (02:17)", characters: ["Mara"], purpose: "Catalyst — first call", mood: "Dread, disbelief" },
      { number: 5, location: "Coast / rocks", timeOfDay: "Next day, afternoon", characters: ["Mara"], purpose: "Discovery — capsized boat, body", mood: "Shock, guilt" },
      { number: 6, location: "Radio room → open water", timeOfDay: "Night → pre-dawn", characters: ["Mara"], purpose: "Second call — first rescue", mood: "Urgency, purpose" },
      { number: 7, location: "Jetty", timeOfDay: "Morning", characters: ["Mara", "Dez"], purpose: "Dez notices fuel; B-story tension", mood: "Suspicion, deflection" },
      { number: 8, location: "Radio room", timeOfDay: "Night", characters: ["Mara", "Dez"], purpose: "Midpoint — she shows him", mood: "Vulnerability, wonder" },
      { number: 9, location: "Radio room", timeOfDay: "Night", characters: ["Mara"], purpose: "Recording attempt fails", mood: "Frustration" },
      { number: 10, location: "Lighthouse interior", timeOfDay: "Night", characters: ["Mara"], purpose: "Ignores a call — guilt", mood: "Anguish" },
      { number: 11, location: "Radio room", timeOfDay: "Night (02:17)", characters: ["Mara"], purpose: "All is lost — her own voice", mood: "Terror, resignation" },
      { number: 12, location: "Lighthouse interior / jetty / open water", timeOfDay: "Night → storm", characters: ["Mara"], purpose: "Decision and launch", mood: "Resolve" },
      { number: 13, location: "Rocks / lighthouse exterior", timeOfDay: "Dawn", characters: ["Mara", "Dez"], purpose: "Found alive; radio silent; door open", mood: "Exhaustion, quiet hope" },
    ],
  };

  const id = `bible_${nanoid(8)}`;
  db.prepare(
    `INSERT INTO story_bibles (id, project_id, version, logline, synopsis, themes, world_rules, characters, beat_sheet, scenes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    projectId,
    version,
    bible.logline,
    bible.synopsis,
    JSON.stringify(bible.themes),
    bible.worldRules,
    JSON.stringify(bible.characters),
    JSON.stringify(bible.beatSheet),
    JSON.stringify(bible.scenes),
  );

  return { id, ...bible };
}

/** Read a bible by ID. */
export function getBible(
  db: Database.Database,
  bibleId: string,
): StoryBible | null {
  const row = db
    .prepare("SELECT * FROM story_bibles WHERE id = ?")
    .get(bibleId) as any;
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    version: row.version,
    logline: row.logline,
    synopsis: row.synopsis,
    themes: JSON.parse(row.themes),
    worldRules: row.world_rules,
    characters: JSON.parse(row.characters),
    beatSheet: JSON.parse(row.beat_sheet),
    scenes: JSON.parse(row.scenes),
  };
}

/** Get the latest bible for a project. */
export function getLatestBible(
  db: Database.Database,
  projectId: string,
): StoryBible | null {
  const row = db
    .prepare(
      "SELECT * FROM story_bibles WHERE project_id = ? ORDER BY version DESC LIMIT 1",
    )
    .get(projectId) as any;
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    version: row.version,
    logline: row.logline,
    synopsis: row.synopsis,
    themes: JSON.parse(row.themes),
    worldRules: row.world_rules,
    characters: JSON.parse(row.characters),
    beatSheet: JSON.parse(row.beat_sheet),
    scenes: JSON.parse(row.scenes),
  };
}

/** Insert the agent's question into the DB and return it. */
export function askNextQuestion(
  db: Database.Database,
  projectId: string,
): { id: string; content: string; round: number } | null {
  const project = db
    .prepare("SELECT id, idea, options FROM projects WHERE id = ?")
    .get(projectId) as ProjectRow | undefined;
  if (!project) return null;

  const messages = db
    .prepare(
      "SELECT id, role, content, round FROM interview_messages WHERE project_id = ? ORDER BY created_at",
    )
    .all(projectId) as MessageRow[];

  const content = generateNextQuestion(project, messages);
  if (!content) return null;

  const round =
    messages.length === 0 ? 1 : completedRounds(messages) + 1;
  const id = `msg_${nanoid(8)}`;

  db.prepare(
    "INSERT INTO interview_messages (id, project_id, role, content, round) VALUES (?, ?, 'agent', ?, ?)",
  ).run(id, projectId, content, round);

  return { id, content, round };
}

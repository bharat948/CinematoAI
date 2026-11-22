import React, { useState, useEffect } from "react";

const API = "/api/v1";

// ── Types ────────────────────────────────────────────────────────

interface Project {
  id: string;
  idea: string;
  stage: string;
  gates: { story: string; treatment: string; lookbook: string };
  createdAt: string;
}

interface Message {
  id: string;
  role: "agent" | "user";
  content: string;
  round: number;
  createdAt: string;
}

interface StoryBible {
  id: string;
  version: number;
  logline: string;
  synopsis: string;
  themes: string[];
  worldRules: string;
  characters: {
    name: string; age: string; want: string; need: string;
    flaw: string; arc: string; lookNotes: string;
  }[];
  beatSheet: { beat: string; description: string }[];
  scenes: {
    number: number; location: string; timeOfDay: string;
    characters: string[]; purpose: string; mood: string;
  }[];
}

interface GateData {
  gate: string;
  status: string;
  bible: StoryBible | null;
  decision: { id: string; decision: string; notes: string; bibleVersion: number; decidedBy: string; createdAt: string } | null;
}

interface ThumbnailPanel {
  panel: number; shot: string; description: string;
  camera: string; mood: string; revealsDate: boolean;
}

interface SceneReading {
  key: string;
  title: string;
  brief: {
    pointOfView: string; want: string; change: string;
    revealingCue: string; whoKnowsWhat: string;
    feelingPerBeat: string[]; turnMoment: string;
  };
  panels: ThumbnailPanel[];
  audienceExperience: string;
}

interface LookTest {
  id: string; description: string; camera: string;
  lighting: string; palette: string;
}

interface SoundSketch {
  description: string; genre: string; instrumentation: string;
  tempo: string; duration: string; mood: string;
}

interface Treatment {
  id: string;
  version: number;
  toneWords: string[];
  themes: string[];
  visualGrammar: {
    palette: string; light: string; lens: string;
    framing: string; movement: string; texture: string;
  };
  sonicPalette: string;
  doList: string[];
  dontList: string[];
  lookTests: LookTest[];
  soundSketch: SoundSketch;
  readings: SceneReading[];
}

interface TreatmentGateData {
  gate: string;
  status: string;
  treatment: Treatment | null;
  selectedReading: { id: string; readingKey: string; decidedBy: string; createdAt: string } | null;
  decision: { id: string; decision: string; notes: string; decidedBy: string } | null;
}

interface EdlEntry {
  shotId: string; panelNumber: number; version: number;
  frameIn: number; frameOut: number; durationFrames: number;
  transition: string; caption: string; kenBurns: string;
}

interface AudioCue {
  id: string; label: string; frameIn: number; frameOut: number;
  type: "music" | "sfx" | "ambience";
}

interface CutData {
  id: string; readingKey: string; version: number;
  fps: number; edl: EdlEntry[]; cues: AudioCue[];
  isCurrent: boolean; totalFrames: number; durationSeconds: number;
  flags?: { id: string; shotId: string; reason: string }[];
}

interface TimedNote {
  id: string; cutId: string; shotId: string;
  tcIn: string; tcOut: string; observation: string;
  intended: string; gap: string; ownerAgent: string;
  experiment: string; priority: string; status: string;
}

// ── Helpers ──────────────────────────────────────────────────────

function stageBg(stage: string): string {
  if (stage === "crew_planning" || stage === "director_intake") return "#d4edda";
  if (stage === "story_review" || stage === "treatment_review") return "#cce5ff";
  return "#fff3cd";
}

// ── App ──────────────────────────────────────────────────────────

export function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [idea, setIdea] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [gateData, setGateData] = useState<GateData | null>(null);
  const [treatmentGate, setTreatmentGate] = useState<TreatmentGateData | null>(null);
  const [sendBackNotes, setSendBackNotes] = useState("");
  const [cutData, setCutData] = useState<CutData | null>(null);
  const [cutNotes, setCutNotes] = useState<TimedNote[]>([]);

  useEffect(() => {
    fetch(`${API}/projects`).then((r) => r.json()).then(setProjects).catch(console.error);
  }, []);

  useEffect(() => {
    if (!activeId) {
      setMessages([]); setActiveProject(null);
      setGateData(null); setTreatmentGate(null);
      return;
    }
    reloadProject(activeId);
    fetch(`${API}/projects/${activeId}/interview/messages`)
      .then((r) => r.json()).then(setMessages).catch(console.error);
  }, [activeId]);

  function reloadProject(pid: string) {
    fetch(`${API}/projects/${pid}`)
      .then((r) => r.json())
      .then((p: Project) => {
        setActiveProject(p);
        if (p.stage === "story_review" || p.gates.story === "approved") {
          fetch(`${API}/projects/${pid}/gates/story`)
            .then((r) => r.json()).then(setGateData).catch(console.error);
        }
        if (p.stage === "treatment_review" || p.gates.treatment === "approved") {
          fetch(`${API}/projects/${pid}/gates/treatment`)
            .then((r) => r.json())
            .then((tg: TreatmentGateData) => {
              setTreatmentGate(tg);
              // Auto-build and load cut if Gate 2 approved
              if (tg.selectedReading && tg.status === "approved") {
                loadOrBuildCut(pid, tg.selectedReading.readingKey);
              }
            })
            .catch(console.error);
        }
      })
      .catch(console.error);
  }

  async function loadOrBuildCut(pid: string, readingKey: string) {
    // Try to load existing cut
    let res = await fetch(`${API}/projects/${pid}/cuts?reading=${readingKey}`);
    if (res.status === 404) {
      // Build it
      res = await fetch(`${API}/projects/${pid}/cuts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ readingKey }),
      });
    }
    if (res.ok) {
      const cut = await res.json();
      setCutData(cut);
      // Load notes
      const notesRes = await fetch(`${API}/projects/${pid}/cuts/notes?cutId=${cut.id}`);
      if (notesRes.ok) setCutNotes(await notesRes.json());
    }
  }

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    if (!idea.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea: idea.trim(), options: { format: "short", autonomy: "collaborative" } }),
      });
      const body = await res.json();
      const proj: Project = { id: body.id, idea: body.idea, stage: body.stage, gates: body.gates, createdAt: body.createdAt };
      setProjects((prev) => [proj, ...prev]);
      setActiveId(body.id); setActiveProject(proj); setIdea("");
      if (body.firstQuestion) {
        setMessages([{ id: body.firstQuestion.id, role: "agent", content: body.firstQuestion.content, round: body.firstQuestion.round, createdAt: "" }]);
      }
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }

  async function sendAnswer(e: React.FormEvent) {
    e.preventDefault();
    if (!answer.trim() || !activeId) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/projects/${activeId}/interview/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: answer.trim() }),
      });
      const body = await res.json();
      setMessages((prev) => {
        const next = [...prev, { ...body.userMessage, createdAt: "" } as Message];
        if (body.agentMessage) next.push({ ...body.agentMessage, createdAt: "" } as Message);
        return next;
      });
      setAnswer("");
      if (body.bible) reloadProject(activeId);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }

  async function handleGate1Decision(decision: "approved" | "sent_back") {
    if (!activeId) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/projects/${activeId}/gates/story`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, notes: decision === "sent_back" ? sendBackNotes : "" }),
      });
      await res.json();
      setSendBackNotes("");
      reloadProject(activeId);
      setProjects((prev) => prev.map((p) => (p.id === activeId ? { ...p, stage: "pending" } : p)));
      // Will be corrected on next reloadProject
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }

  async function handleGate2Decision(decision: "approved" | "sent_back", selectedReading?: string) {
    if (!activeId) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/projects/${activeId}/gates/treatment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          selectedReading: decision === "approved" ? selectedReading : undefined,
          notes: decision === "sent_back" ? sendBackNotes : "",
        }),
      });
      await res.json();
      setSendBackNotes("");
      reloadProject(activeId);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }

  const lastMsg = messages[messages.length - 1];
  const waitingForUser = lastMsg?.role === "agent";
  const stage = activeProject?.stage;

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 760, margin: "0 auto", padding: 24, color: "#1a1a1a" }}>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>Neurohood</h1>
      <p style={{ color: "#888", fontSize: 13, marginTop: 0 }}>Pre-production assistant for filmmakers</p>

      {!activeId && (
        <div>
          <h2 style={{ fontSize: 18 }}>Start a new project</h2>
          <form onSubmit={createProject}>
            <textarea value={idea} onChange={(e) => setIdea(e.target.value)}
              placeholder="Describe your scene idea..." rows={3}
              style={{ width: "100%", fontSize: 15, padding: 8, boxSizing: "border-box" }} />
            <button type="submit" disabled={loading || !idea.trim()} style={{ marginTop: 8 }}>
              Create project
            </button>
          </form>
          {projects.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <h2 style={{ fontSize: 18 }}>Your projects</h2>
              {projects.map((p) => (
                <div key={p.id} onClick={() => setActiveId(p.id)}
                  style={{ padding: 12, marginBottom: 8, border: "1px solid #ccc", borderRadius: 6, cursor: "pointer" }}>
                  <strong>{p.id}</strong>{" "}
                  <span style={{ fontSize: 12, padding: "2px 6px", background: stageBg(p.stage), borderRadius: 4 }}>
                    {p.stage}
                  </span>
                  <br />
                  <span style={{ color: "#666", fontSize: 13 }}>
                    {p.idea.length > 100 ? p.idea.slice(0, 100) + "…" : p.idea}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeId && activeProject && (
        <div>
          <button onClick={() => setActiveId(null)} style={{ marginBottom: 16 }}>&larr; Back to projects</button>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
            <span style={{ fontWeight: "bold" }}>{activeProject.id}</span>
            <span style={{ fontSize: 12, padding: "2px 8px", background: stageBg(stage!), borderRadius: 4 }}>
              {stage}
            </span>
          </div>

          {/* Interview */}
          {stage === "story_interview" && (
            <div>
              <div style={{ marginBottom: 16 }}>
                {messages.map((m) => (
                  <div key={m.id} style={{
                    padding: 12, marginBottom: 8, borderRadius: 6,
                    background: m.role === "agent" ? "#f0f4ff" : "#f4f4f4",
                    borderLeft: m.role === "agent" ? "3px solid #4466cc" : "3px solid #999",
                  }}>
                    <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>
                      {m.role === "agent" ? "Story Agent" : "You"} — Round {m.round}
                    </div>
                    <div style={{ whiteSpace: "pre-wrap" }}>{m.content}</div>
                  </div>
                ))}
              </div>
              {waitingForUser && (
                <form onSubmit={sendAnswer}>
                  <textarea value={answer} onChange={(e) => setAnswer(e.target.value)}
                    placeholder="Your answer..." rows={4}
                    style={{ width: "100%", fontSize: 15, padding: 8, boxSizing: "border-box" }} />
                  <button type="submit" disabled={loading || !answer.trim()} style={{ marginTop: 8 }}>
                    Send answer
                  </button>
                </form>
              )}
            </div>
          )}

          {/* Gate 1 */}
          {(stage === "story_review") && gateData?.bible && (
            <BibleReview bible={gateData.bible} gateStatus={gateData.status}
              decision={gateData.decision} loading={loading}
              sendBackNotes={sendBackNotes} onSendBackNotesChange={setSendBackNotes}
              onDecision={handleGate1Decision} />
          )}

          {/* Gate 2 */}
          {(stage === "treatment_review" || (stage === "crew_planning" && treatmentGate?.treatment)) && treatmentGate?.treatment && (
            <TreatmentReview
              treatment={treatmentGate.treatment}
              gateStatus={treatmentGate.status}
              selectedReading={treatmentGate.selectedReading}
              decision={treatmentGate.decision}
              loading={loading}
              sendBackNotes={sendBackNotes}
              onSendBackNotesChange={setSendBackNotes}
              onDecision={handleGate2Decision}
            />
          )}

          {/* Animatic player */}
          {stage === "crew_planning" && cutData && (
            <AnimaticPlayer cut={cutData} notes={cutNotes} />
          )}
        </div>
      )}
    </div>
  );
}

// ── Gate 1: Bible Review ─────────────────────────────────────────

function BibleReview({ bible, gateStatus, decision, loading, sendBackNotes, onSendBackNotesChange, onDecision }: {
  bible: StoryBible; gateStatus: string; decision: GateData["decision"];
  loading: boolean; sendBackNotes: string; onSendBackNotesChange: (v: string) => void;
  onDecision: (d: "approved" | "sent_back") => void;
}) {
  const isApproved = gateStatus === "approved";

  return (
    <div>
      <h2 style={{ fontSize: 18, borderBottom: "2px solid #4466cc", paddingBottom: 8 }}>
        Gate 1 — Story Review
        {isApproved && <span style={{ marginLeft: 12, fontSize: 13, color: "#155724", background: "#d4edda", padding: "2px 8px", borderRadius: 4 }}>Approved</span>}
      </h2>
      <Section title="Logline"><p style={{ fontStyle: "italic" }}>{bible.logline}</p></Section>
      <Section title="Synopsis"><p style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{bible.synopsis}</p></Section>
      <Section title="Themes"><ul>{bible.themes.map((t, i) => <li key={i}>{t}</li>)}</ul></Section>
      <Section title="World Rules"><p>{bible.worldRules}</p></Section>
      <Section title="Characters">
        {bible.characters.map((c, i) => (
          <div key={i} style={{ padding: 12, marginBottom: 8, background: "#f8f9fa", borderRadius: 6, borderLeft: "3px solid #6c757d" }}>
            <strong>{c.name} ({c.age})</strong>
            <div style={{ fontSize: 13, marginTop: 4 }}>
              <div><strong>Want:</strong> {c.want}</div>
              <div><strong>Need:</strong> {c.need}</div>
              <div><strong>Flaw:</strong> {c.flaw}</div>
              <div><strong>Arc:</strong> {c.arc}</div>
              <div style={{ color: "#666" }}><strong>Look:</strong> {c.lookNotes}</div>
            </div>
          </div>
        ))}
      </Section>
      <Section title="Beat Sheet">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr style={{ borderBottom: "2px solid #dee2e6" }}>
            <th style={{ textAlign: "left", padding: "6px 8px" }}>Beat</th>
            <th style={{ textAlign: "left", padding: "6px 8px" }}>Description</th>
          </tr></thead>
          <tbody>{bible.beatSheet.map((b, i) => (
            <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: "6px 8px", fontWeight: "bold", whiteSpace: "nowrap", verticalAlign: "top" }}>{b.beat}</td>
              <td style={{ padding: "6px 8px" }}>{b.description}</td>
            </tr>
          ))}</tbody>
        </table>
      </Section>

      {!isApproved && (
        <GateDecisionBox loading={loading} sendBackNotes={sendBackNotes}
          onSendBackNotesChange={onSendBackNotesChange}
          onApprove={() => onDecision("approved")}
          onSendBack={() => onDecision("sent_back")}
          approveLabel="Approve story" />
      )}
      {isApproved && decision && (
        <div style={{ marginTop: 16, padding: 12, background: "#d4edda", borderRadius: 6, fontSize: 13 }}>
          Story locked (v{decision.bibleVersion}) by {decision.decidedBy}. Director is building the treatment.
        </div>
      )}
    </div>
  );
}

// ── Gate 2: Treatment Review ─────────────────────────────────────

function TreatmentReview({ treatment, gateStatus, selectedReading, decision, loading, sendBackNotes, onSendBackNotesChange, onDecision }: {
  treatment: Treatment; gateStatus: string;
  selectedReading: TreatmentGateData["selectedReading"];
  decision: TreatmentGateData["decision"];
  loading: boolean; sendBackNotes: string; onSendBackNotesChange: (v: string) => void;
  onDecision: (d: "approved" | "sent_back", reading?: string) => void;
}) {
  const [chosenReading, setChosenReading] = useState<string>("");
  const isApproved = gateStatus === "approved";
  const vg = treatment.visualGrammar;

  return (
    <div>
      <h2 style={{ fontSize: 18, borderBottom: "2px solid #8844cc", paddingBottom: 8 }}>
        Gate 2 — Treatment Review
        {isApproved && <span style={{ marginLeft: 12, fontSize: 13, color: "#155724", background: "#d4edda", padding: "2px 8px", borderRadius: 4 }}>Approved</span>}
      </h2>

      <Section title="Tone Words" color="#8844cc">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {treatment.toneWords.map((w, i) => (
            <span key={i} style={{ padding: "4px 12px", background: "#f3eaff", borderRadius: 20, fontSize: 13 }}>{w}</span>
          ))}
        </div>
      </Section>

      <Section title="Themes" color="#8844cc">
        <ul>{treatment.themes.map((t, i) => <li key={i}>{t}</li>)}</ul>
      </Section>

      <Section title="Visual Grammar" color="#8844cc">
        <div style={{ fontSize: 13, lineHeight: 1.7 }}>
          {Object.entries(vg).map(([k, v]) => (
            <div key={k} style={{ marginBottom: 6 }}>
              <strong style={{ textTransform: "capitalize" }}>{k}:</strong> {v}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Sonic Palette" color="#8844cc">
        <p style={{ fontSize: 13 }}>{treatment.sonicPalette}</p>
      </Section>

      <Section title="Do / Don't" color="#8844cc">
        <div style={{ display: "flex", gap: 24 }}>
          <div style={{ flex: 1 }}>
            <strong style={{ color: "#28a745" }}>Do</strong>
            <ul style={{ fontSize: 13 }}>{treatment.doList.map((d, i) => <li key={i}>{d}</li>)}</ul>
          </div>
          <div style={{ flex: 1 }}>
            <strong style={{ color: "#dc3545" }}>Don't</strong>
            <ul style={{ fontSize: 13 }}>{treatment.dontList.map((d, i) => <li key={i}>{d}</li>)}</ul>
          </div>
        </div>
      </Section>

      <Section title="Look Tests (4 frames)" color="#8844cc">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {treatment.lookTests.map((lt) => (
            <div key={lt.id} style={{ padding: 12, background: "#f8f9fa", borderRadius: 6, border: "1px solid #dee2e6" }}>
              <div style={{ fontSize: 13, fontWeight: "bold", marginBottom: 4 }}>{lt.camera}</div>
              <div style={{ fontSize: 12, color: "#555" }}>{lt.description}</div>
              <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
                Light: {lt.lighting} | Palette: {lt.palette}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Sound Sketch (30s)" color="#8844cc">
        <div style={{ padding: 12, background: "#f8f9fa", borderRadius: 6, border: "1px solid #dee2e6" }}>
          <p style={{ fontSize: 13, margin: "0 0 8px" }}>{treatment.soundSketch.description}</p>
          <div style={{ fontSize: 12, color: "#666" }}>
            {treatment.soundSketch.genre} · {treatment.soundSketch.instrumentation} · {treatment.soundSketch.tempo}
          </div>
        </div>
      </Section>

      {/* Two readings side by side */}
      <h3 style={{ fontSize: 16, color: "#8844cc", marginTop: 32, marginBottom: 16, borderBottom: "1px solid #ddd", paddingBottom: 8 }}>
        Two readings of the lighthouse scene
      </h3>
      <p style={{ fontSize: 13, color: "#666", marginBottom: 16 }}>
        Both readings use the same characters, sets, palette, and score. They differ in <strong>who knows what, and when</strong>.
        Choose which way the audience should experience the discovery.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        {treatment.readings.map((reading) => {
          const isSelected = isApproved
            ? selectedReading?.readingKey === reading.key
            : chosenReading === reading.key;
          const revealPanel = reading.panels.find((p) => p.revealsDate);

          return (
            <div key={reading.key}
              onClick={() => !isApproved && setChosenReading(reading.key)}
              style={{
                padding: 16, borderRadius: 8,
                border: isSelected ? "3px solid #8844cc" : "2px solid #dee2e6",
                background: isSelected ? "#f9f4ff" : "#fff",
                cursor: isApproved ? "default" : "pointer",
                transition: "border-color 0.15s",
              }}>
              <h4 style={{ marginTop: 0, fontSize: 15, color: isSelected ? "#8844cc" : "#333" }}>
                {reading.title}
                {isSelected && isApproved && <span style={{ marginLeft: 8, fontSize: 11, color: "#155724", background: "#d4edda", padding: "2px 6px", borderRadius: 4 }}>Selected</span>}
              </h4>

              <p style={{ fontSize: 13, fontStyle: "italic", color: "#555" }}>
                {reading.audienceExperience}
              </p>

              <div style={{ fontSize: 12, marginBottom: 12 }}>
                <div><strong>POV:</strong> {reading.brief.pointOfView}</div>
                <div><strong>Change:</strong> {reading.brief.change}</div>
                <div><strong>Who knows what:</strong> {reading.brief.whoKnowsWhat}</div>
                <div><strong>Turn moment:</strong> {reading.brief.turnMoment}</div>
              </div>

              <div style={{ fontSize: 12, color: "#8844cc", fontWeight: "bold", marginBottom: 8 }}>
                Date revealed at: Panel {revealPanel?.panel} — {revealPanel?.shot}
              </div>

              <h5 style={{ fontSize: 13, marginBottom: 8 }}>Panels ({reading.panels.length})</h5>
              {reading.panels.map((p) => (
                <div key={p.panel} style={{
                  padding: 8, marginBottom: 6, fontSize: 12, borderRadius: 4,
                  background: p.revealsDate ? "#fff3cd" : "#f8f9fa",
                  border: p.revealsDate ? "1px solid #ffc107" : "1px solid #eee",
                }}>
                  <div style={{ fontWeight: "bold" }}>Panel {p.panel}: {p.shot}</div>
                  <div style={{ color: "#555" }}>{p.description}</div>
                  <div style={{ color: "#888", marginTop: 2 }}>{p.camera} · {p.mood}</div>
                </div>
              ))}

              <h5 style={{ fontSize: 13, marginTop: 12, marginBottom: 4 }}>Feeling per beat</h5>
              <ol style={{ fontSize: 12, margin: 0, paddingLeft: 20 }}>
                {reading.brief.feelingPerBeat.map((f, i) => <li key={i}>{f}</li>)}
              </ol>
            </div>
          );
        })}
      </div>

      {/* Gate decision */}
      {!isApproved && (
        <div style={{ marginTop: 24, padding: 16, border: "2px solid #8844cc", borderRadius: 8, background: "#f9f4ff" }}>
          <h3 style={{ marginTop: 0, fontSize: 15 }}>Your decision</h3>
          <p style={{ fontSize: 13, color: "#555" }}>
            Select a reading above, then approve to lock the treatment and move to crew planning.
          </p>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button onClick={() => onDecision("approved", chosenReading)}
              disabled={loading || !chosenReading}
              style={{
                padding: "8px 20px", background: chosenReading ? "#28a745" : "#ccc",
                color: "white", border: "none", borderRadius: 4, cursor: chosenReading ? "pointer" : "not-allowed", fontWeight: "bold",
              }}>
              Approve treatment{chosenReading ? ` — "${treatment.readings.find((r) => r.key === chosenReading)?.title}"` : ""}
            </button>
          </div>
          <div>
            <textarea value={sendBackNotes} onChange={(e) => onSendBackNotesChange(e.target.value)}
              placeholder="Notes for revision..." rows={2}
              style={{ width: "100%", fontSize: 14, padding: 8, marginBottom: 8, boxSizing: "border-box" }} />
            <button onClick={() => onDecision("sent_back")}
              disabled={loading || !sendBackNotes.trim()}
              style={{ padding: "6px 16px", background: "#ffc107", border: "none", borderRadius: 4, cursor: "pointer" }}>
              Send back with notes
            </button>
          </div>
        </div>
      )}

      {isApproved && selectedReading && (
        <div style={{ marginTop: 16, padding: 12, background: "#d4edda", borderRadius: 6, fontSize: 13 }}>
          Treatment locked. Reading selected: <strong>"{treatment.readings.find((r) => r.key === selectedReading.readingKey)?.title}"</strong> by {selectedReading.decidedBy}. Project is now in crew planning.
        </div>
      )}
    </div>
  );
}

// ── Shared Components ────────────────────────────────────────────

function Section({ title, color, children }: { title: string; color?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h3 style={{ fontSize: 15, color: color ?? "#4466cc" }}>{title}</h3>
      {children}
    </div>
  );
}

function GateDecisionBox({ loading, sendBackNotes, onSendBackNotesChange, onApprove, onSendBack, approveLabel }: {
  loading: boolean; sendBackNotes: string; onSendBackNotesChange: (v: string) => void;
  onApprove: () => void; onSendBack: () => void; approveLabel: string;
}) {
  return (
    <div style={{ marginTop: 24, padding: 16, border: "2px solid #4466cc", borderRadius: 8, background: "#f0f4ff" }}>
      <h3 style={{ marginTop: 0, fontSize: 15 }}>Your decision</h3>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={onApprove} disabled={loading}
          style={{ padding: "8px 20px", background: "#28a745", color: "white", border: "none", borderRadius: 4, cursor: "pointer", fontWeight: "bold" }}>
          {approveLabel}
        </button>
      </div>
      <div>
        <textarea value={sendBackNotes} onChange={(e) => onSendBackNotesChange(e.target.value)}
          placeholder="Notes for revision..." rows={2}
          style={{ width: "100%", fontSize: 14, padding: 8, marginBottom: 8, boxSizing: "border-box" }} />
        <button onClick={onSendBack} disabled={loading || !sendBackNotes.trim()}
          style={{ padding: "6px 16px", background: "#ffc107", border: "none", borderRadius: 4, cursor: "pointer" }}>
          Send back with notes
        </button>
      </div>
    </div>
  );
}

// ── Animatic Player ──────────────────────────────────────────────

function AnimaticPlayer({ cut, notes }: { cut: CutData; notes: TimedNote[] }) {
  const [currentFrame, setCurrentFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const intervalRef = React.useRef<number | null>(null);

  // Find which EDL entry is active at the current frame
  const activeEntry = cut.edl.find(
    (e) => currentFrame >= e.frameIn && currentFrame <= e.frameOut,
  ) ?? cut.edl[0];

  const activeIdx = cut.edl.indexOf(activeEntry);

  // Active audio cues at current frame
  const activeCues = cut.cues.filter(
    (c) => currentFrame >= c.frameIn && currentFrame <= c.frameOut,
  );

  // Flagged shots
  const flaggedIds = new Set((cut.flags ?? []).map((f) => f.shotId));

  // Notes for the current shot
  const shotNotes = notes.filter((n) => n.shotId === activeEntry.shotId);

  // Timecode display
  function framesToTc(frames: number): string {
    const totalSec = frames / cut.fps;
    const min = Math.floor(totalSec / 60);
    const sec = Math.floor(totalSec % 60);
    const fr = frames % cut.fps;
    return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}:${String(fr).padStart(2, "0")}`;
  }

  // Playback
  useEffect(() => {
    if (playing) {
      // Run at ~12fps display rate (every other frame at 24fps) for smooth browser playback
      intervalRef.current = window.setInterval(() => {
        setCurrentFrame((prev) => {
          if (prev >= cut.totalFrames - 1) {
            setPlaying(false);
            return 0;
          }
          return prev + 2; // skip every other frame for display
        });
      }, 1000 / 12);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [playing, cut.totalFrames]);

  function togglePlay() {
    if (currentFrame >= cut.totalFrames - 1) setCurrentFrame(0);
    setPlaying(!playing);
  }

  function seekToShot(idx: number) {
    setCurrentFrame(cut.edl[idx].frameIn);
    setPlaying(false);
  }

  const progress = cut.totalFrames > 0 ? (currentFrame / cut.totalFrames) * 100 : 0;

  return (
    <div style={{ marginTop: 32 }}>
      <h2 style={{ fontSize: 18, borderBottom: "2px solid #cc6633", paddingBottom: 8 }}>
        Animatic — {cut.readingKey === "discover_with_mara" ? "Discover it with Mara" : "Let the audience know first"}
        <span style={{ marginLeft: 12, fontSize: 12, color: "#888" }}>
          v{cut.version} · {cut.edl.length} shots · {cut.durationSeconds.toFixed(1)}s · {cut.fps}fps
        </span>
      </h2>

      {/* Panel display */}
      <div style={{
        background: "#111", color: "#fff", borderRadius: 8, overflow: "hidden",
        marginBottom: 16, position: "relative",
      }}>
        {/* Simulated panel — gradient bg representing the shot */}
        <div style={{
          height: 320, display: "flex", flexDirection: "column",
          justifyContent: "center", alignItems: "center", padding: 24,
          background: activeEntry.caption.includes("NOV")
            ? "linear-gradient(135deg, #2a1a0a 0%, #4a3010 50%, #2a1a0a 100%)"
            : `linear-gradient(135deg, #0a1a2a 0%, #1a2a3a ${30 + activeIdx * 15}%, #0a1a2a 100%)`,
          transition: "background 0.3s",
        }}>
          <div style={{ fontSize: 11, color: "#888", marginBottom: 8, textTransform: "uppercase" }}>
            Panel {activeEntry.panelNumber} · Shot {activeEntry.shotId.slice(-8)}
            {flaggedIds.has(activeEntry.shotId) && (
              <span style={{ marginLeft: 8, color: "#ffc107", fontWeight: "bold" }}>FLAGGED</span>
            )}
          </div>
          <div style={{ fontSize: 14, textAlign: "center", maxWidth: 500, lineHeight: 1.6, marginBottom: 12 }}>
            {activeEntry.caption || "(no caption)"}
          </div>
          <div style={{ fontSize: 11, color: "#777", textAlign: "center", maxWidth: 500 }}>
            {cut.edl[activeIdx]?.transition !== "cut" && (
              <span style={{ marginRight: 8, color: "#aaa" }}>[{cut.edl[activeIdx].transition}]</span>
            )}
            {/* Shot description as a "storyboard note" */}
          </div>
        </div>

        {/* Caption bar */}
        {activeEntry.caption && (
          <div style={{
            background: "rgba(0,0,0,0.85)", padding: "8px 16px",
            fontSize: 15, textAlign: "center", fontStyle: "italic",
            borderTop: "1px solid #333",
          }}>
            {activeEntry.caption}
          </div>
        )}
      </div>

      {/* Transport controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <button onClick={togglePlay} style={{
          padding: "6px 16px", background: playing ? "#dc3545" : "#28a745",
          color: "white", border: "none", borderRadius: 4, cursor: "pointer", fontWeight: "bold",
          minWidth: 70,
        }}>
          {playing ? "Pause" : "Play"}
        </button>
        <button onClick={() => { setCurrentFrame(0); setPlaying(false); }}
          style={{ padding: "6px 12px", border: "1px solid #ccc", borderRadius: 4, cursor: "pointer", background: "white" }}>
          Reset
        </button>
        <span style={{ fontSize: 13, fontFamily: "monospace", color: "#555" }}>
          {framesToTc(currentFrame)} / {framesToTc(cut.totalFrames)}
        </span>
      </div>

      {/* Timeline bar */}
      <div style={{ position: "relative", height: 32, background: "#eee", borderRadius: 4, marginBottom: 8, overflow: "hidden", cursor: "pointer" }}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const pct = (e.clientX - rect.left) / rect.width;
          setCurrentFrame(Math.floor(pct * cut.totalFrames));
          setPlaying(false);
        }}>
        {/* Shot segments */}
        {cut.edl.map((entry, i) => {
          const left = (entry.frameIn / cut.totalFrames) * 100;
          const width = (entry.durationFrames / cut.totalFrames) * 100;
          const isFlagged = flaggedIds.has(entry.shotId);
          return (
            <div key={entry.shotId} style={{
              position: "absolute", left: `${left}%`, width: `${width}%`, height: "100%",
              background: i === activeIdx ? "#4466cc" : isFlagged ? "#ffc107" : (i % 2 === 0 ? "#bbb" : "#ccc"),
              borderRight: "1px solid #fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, color: i === activeIdx ? "#fff" : "#555",
              transition: "background 0.15s",
            }}>
              {width > 5 && `P${entry.panelNumber}`}
            </div>
          );
        })}
        {/* Audio cue overlay */}
        {cut.cues.map((cue) => {
          const left = (cue.frameIn / cut.totalFrames) * 100;
          const width = ((cue.frameOut - cue.frameIn) / cut.totalFrames) * 100;
          const color = cue.type === "music" ? "#8844cc" : cue.type === "sfx" ? "#cc4444" : "#44aa88";
          return (
            <div key={cue.id} style={{
              position: "absolute", left: `${left}%`, width: `${width}%`, bottom: 0, height: 4,
              background: color, opacity: 0.7,
            }} title={`${cue.label} (${cue.type})`} />
          );
        })}
        {/* Playhead */}
        <div style={{
          position: "absolute", left: `${progress}%`, top: 0, bottom: 0,
          width: 2, background: "#cc3333", zIndex: 10,
        }} />
      </div>

      {/* Audio cue legend */}
      <div style={{ display: "flex", gap: 16, fontSize: 11, color: "#777", marginBottom: 16 }}>
        {cut.cues.map((cue) => {
          const color = cue.type === "music" ? "#8844cc" : cue.type === "sfx" ? "#cc4444" : "#44aa88";
          return (
            <span key={cue.id}>
              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: color, marginRight: 4 }} />
              {cue.label}
            </span>
          );
        })}
        {(cut.flags ?? []).length > 0 && (
          <span>
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "#ffc107", marginRight: 4 }} />
            Flagged for re-review
          </span>
        )}
      </div>

      {/* Shot list */}
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, color: "#cc6633" }}>Shot list (EDL)</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #dee2e6" }}>
              <th style={{ textAlign: "left", padding: "4px 6px" }}>Panel</th>
              <th style={{ textAlign: "left", padding: "4px 6px" }}>TC In</th>
              <th style={{ textAlign: "left", padding: "4px 6px" }}>TC Out</th>
              <th style={{ textAlign: "left", padding: "4px 6px" }}>Dur</th>
              <th style={{ textAlign: "left", padding: "4px 6px" }}>Caption</th>
              <th style={{ textAlign: "left", padding: "4px 6px" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {cut.edl.map((entry, i) => {
              const isFlagged = flaggedIds.has(entry.shotId);
              const isActive = i === activeIdx;
              return (
                <tr key={entry.shotId}
                  onClick={() => seekToShot(i)}
                  style={{
                    borderBottom: "1px solid #eee", cursor: "pointer",
                    background: isActive ? "#e8f0ff" : isFlagged ? "#fff8e1" : "transparent",
                  }}>
                  <td style={{ padding: "4px 6px", fontWeight: "bold" }}>P{entry.panelNumber}</td>
                  <td style={{ padding: "4px 6px", fontFamily: "monospace" }}>{framesToTc(entry.frameIn)}</td>
                  <td style={{ padding: "4px 6px", fontFamily: "monospace" }}>{framesToTc(entry.frameOut)}</td>
                  <td style={{ padding: "4px 6px" }}>{(entry.durationFrames / cut.fps).toFixed(1)}s</td>
                  <td style={{ padding: "4px 6px", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {entry.caption || "—"}
                  </td>
                  <td style={{ padding: "4px 6px" }}>
                    {isFlagged && <span style={{ color: "#856404", background: "#fff3cd", padding: "1px 6px", borderRadius: 3 }}>Flagged</span>}
                    {isActive && <span style={{ color: "#004085", background: "#cce5ff", padding: "1px 6px", borderRadius: 3, marginLeft: 4 }}>Playing</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Timed notes on current shot */}
      {shotNotes.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, color: "#cc6633" }}>Notes on current shot</h3>
          {shotNotes.map((n) => (
            <div key={n.id} style={{
              padding: 10, marginBottom: 6, background: "#fff8e1", borderRadius: 4,
              border: "1px solid #ffc107", fontSize: 12,
            }}>
              <div style={{ fontWeight: "bold" }}>
                {n.tcIn}–{n.tcOut} → {n.ownerAgent}
                <span style={{ marginLeft: 8, color: n.priority === "high" ? "#dc3545" : "#666" }}>
                  [{n.priority}]
                </span>
              </div>
              <div>{n.observation}</div>
              {n.gap && <div style={{ color: "#856404" }}>Gap: {n.gap}</div>}
              {n.experiment && <div style={{ color: "#555" }}>Experiment: {n.experiment}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import express from "express";
import cors from "cors";
import { openDb } from "./db.js";
import { projectRoutes } from "./routes/projects.js";
import { interviewRoutes } from "./routes/interview.js";
import { gateRoutes } from "./routes/gates.js";
import { cutRoutes } from "./routes/cuts.js";
import { jobRoutes } from "./routes/jobs.js";

const PORT = parseInt(process.env.PORT ?? "3900", 10);

const db = openDb();
const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/v1/projects", projectRoutes(db));
app.use("/api/v1/projects/:id/interview", interviewRoutes(db));
app.use("/api/v1/projects/:id/gates", gateRoutes(db));
app.use("/api/v1/projects/:id/cuts", cutRoutes(db));
app.use("/api/v1/projects/:id/jobs", jobRoutes(db));

app.listen(PORT, () => {
  console.log(`[neurohood] API listening on http://localhost:${PORT}`);
});

export { app, db };

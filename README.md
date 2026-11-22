# CinematoAI

CinematoAI is the repository for **Neurohood**, a pre-production assistant for filmmakers. The local pilot follows Mara, a lighthouse keeper who hears tomorrow’s distress call. Interview the Story agent, approve a story bible, and choose between two directorial readings to see how the timing of the reveal changes in a storyboard animatic. The pilot uses local fixtures and runs without provider credentials.

## Run locally

Use Node.js 20.20.2 and npm 10 (the tested setup). From the repository root, install dependencies for both workspaces. If you use nvm, run `nvm install` first to select the version in `.nvmrc`.

```sh
npm ci
npm run dev:server
```

Leave the API running. In a second terminal at the repository root, start the web app.

```sh
npm run dev:web
```

Open the local URL printed by Vite, normally [http://localhost:5173](http://localhost:5173). The web app forwards `/api` requests to the Express server on port 3900. To check the connection through Vite, open [the project list](http://localhost:5173/api/v1/projects). A fresh database returns `[]`.

## Try the lighthouse pilot

1. Enter “Mara hears a distress call dated tomorrow” and select **Create project**.
2. Answer the three rounds of interview questions. To try resuming, go back to the project list and reopen the project between rounds.
3. Review and approve the story bible, then select and approve a directorial reading.
4. Play the resulting cut. To compare the other reading, create a second project and choose it at the treatment gate.

The API creates `server/neurohood.db` on first launch. Restarting the servers preserves projects, interview answers and gate decisions. The job API also supports simulated provider costs, reservations, retries and fallback.

## Developer commands

Run these from the repository root after installing dependencies.

| Command | Purpose |
| --- | --- |
| `npm run dev:server` | Start the Express API in watch mode |
| `npm run dev:web` | Start the Vite development server |
| `npm test` | Run the server’s Vitest API and persistence tests |
| `npm run build` | Type-check the web app and build its static assets into `web/dist/` |

If dependency installation fails while building `better-sqlite3`, check `node -v` against `.nvmrc`. On platforms without a prebuilt binary, npm needs Python and a native C++ build toolchain to compile the SQLite binding.

## Find your way around

| Location | What lives there |
| --- | --- |
| [web/src/](web/src/) | React project list, interview, gate reviews and animatic player |
| [server/src/routes/](server/src/routes/) | HTTP endpoints for projects, interviews, gates, cuts and jobs |
| [server/src/agents/](server/src/agents/) | Fixture story, direction and editing logic |
| [server/src/db.ts](server/src/db.ts) | SQLite schema and database initialization |
| [server/src/api.test.ts](server/src/api.test.ts) | Executable examples of API requests and pilot workflows |
| [Development handoff](docs/HANDOFF.md) | Current checkpoint, owner decisions and remaining pilot work |
| [Annotated specification](docs/neurohood-spec.md) | Requirements and implementation notes, searchable by requirement ID |
| [Vendor pack](docs/vendor-pack-v1-draft.md) | Original v1 draft covering scope, milestones and acceptance criteria |
| [Initial handoff](docs/archive/initial-handoff.md) | Historical planning notes from before the scaffold |

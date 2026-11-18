# OpenCode Brain

A local personal knowledge system with three cores:

- **Memory Engine** — store conversations, decisions, project context, mistakes, lessons and notes.
- **Knowledge Graph** — connect people, projects, technologies, concepts and decisions with typed relationships.
- **Visual Brain** — explore the graph interactively, inspect nodes, and follow links to memories.
- **Memory Intelligence** — local TF-IDF similarity finds duplicate memories and suggests related memories and entity links.
- **Memory Timeline** — a history of every create, update, merge ("replaced") and deletion.

Everything runs on your machine. SQLite is the source of truth; JSON import/export keeps your data portable.

## Usage
See **[USER-GUIDE.md](USER-GUIDE.md)** for a complete step-by-step manual (creating memories, linking entities, using each view, backups, and workflows).

## Stack

- React + TypeScript + [React Flow](https://reactflow.dev) (`@xyflow/react`)
- Node.js + Express
- SQLite via `better-sqlite3`
- Vite for the dev server / client build

## Run it

```bash
npm install
npm run dev
```

Open **http://localhost:5173**. The Express API runs on port 3001 (Vite proxies `/api` to it).

On first run the database is seeded with a small demo brain so the graph is immediately useful.

### Production build (optional)

```bash
npm run build
npm start
```

Then open **http://localhost:3001** (Express serves the built client).

## Architecture

```
src/
  shared/types.ts        Domain types shared by client and server
  server/
    db.ts                SQLite connection + schema
    store.ts             Repository layer (all persistence)
    seed.ts              First-run demo data
    similarity.ts        TF-IDF cosine similarity (duplicates, related, suggestions)
    index.ts             Express API routes
  client/
    api.ts               Typed fetch client
    ui.ts                Colors / option lists
    App.tsx              State + wiring + view switcher
    components/
      Sidebar.tsx        Memory engine: searchable memory + entity lists
      GraphView.tsx      Visual brain: React Flow graph with connection highlighting
      Timeline.tsx       Create/update/replace/delete history feed
      Intelligence.tsx   Duplicate clusters + related-memory suggestions
      Inspector.tsx      Inspect / edit entities, memories, relationships
      Modal.tsx          Create dialogs
```

### Design system
OLED dark theme, IBM Plex Sans for UI and JetBrains Mono for data/labels, green primary
accent (`#22C55E`) with amber reserved for graph focus. Visible keyboard focus rings,
reduced-motion support, skip link, and responsive breakpoints at 1200 / 980 / 700px.

All persistence goes through `server/store.ts`, so the storage backend can be replaced later (e.g. Graphiti + FalkorDB) without changing the routes or UI. The design keeps future phases in mind:

- **Phase 2** — AI memory extraction and auto-linking.
- **Phase 3** — Graphiti / FalkorDB graph backend.
- **Phase 4** — OpenCode plugin / MCP integration.

## API overview

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/graph` | Full graph (nodes, edges, memories) |
| GET | `/api/stats` | Counts |
| GET | `/api/entities/:id/context` | Entity + neighbors + linked memories |
| CRUD | `/api/memories` | Memories |
| CRUD | `/api/entities` | Entities |
| CRUD | `/api/relationships` | Relationships |
| GET | `/api/timeline` | History feed (filter with `type` / `action`) |
| GET | `/api/timeline/:type/:id` | History for one subject |
| GET | `/api/intelligence` | Duplicate clusters + related-memory suggestions |
| GET | `/api/memories/:id/intelligence` | Related memories + entity suggestions for one memory |
| POST | `/api/memories/:id/link` | Link two memories (`{ memoryId }`) |
| DELETE | `/api/memories/:id/link/:otherId` | Unlink two memories |
| POST | `/api/memories/:id/merge` | Merge a memory into another (`{ sourceId }`) |
| GET | `/api/backup/export` | Download JSON backup |
| POST | `/api/backup/import` | Restore from JSON backup |

## Data location

`data/brain.db` (SQLite, WAL mode). Backups are JSON files you export from the UI. Both are excluded from git.

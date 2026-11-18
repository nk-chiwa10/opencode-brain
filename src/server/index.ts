import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedIfEmpty } from './seed.js';
import * as store from './store.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

seedIfEmpty();
store.backfillHistory();

const ok = <T,>(res: express.Response, data: T) => res.json(data);
const fail = (res: express.Response, status: number, message: string) =>
  res.status(status).json({ error: message });

// ----- health / stats -----
app.get('/api/health', (_req, res) => ok(res, { status: 'ok' }));
app.get('/api/stats', (_req, res) => ok(res, store.stats()));

// ----- graph -----
app.get('/api/graph', (_req, res) => ok(res, store.getGraph()));
app.get('/api/entities/:id/context', (req, res) => {
  const ctx = store.getEntityContext(req.params.id);
  return ctx ? ok(res, ctx) : fail(res, 404, 'Entity not found');
});

// ----- timeline -----
app.get('/api/timeline', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 120, 2000);
  return ok(res, store.getTimeline(limit, req.query.type as string | undefined, req.query.action as string | undefined));
});
app.get('/api/timeline/:type/:id', (req, res) =>
  ok(res, store.getSubjectHistory(req.params.type, req.params.id)));

// ----- memory intelligence -----
app.get('/api/intelligence', (_req, res) => ok(res, store.getIntelligence()));
app.get('/api/memories/:id/intelligence', (req, res) => {
  const result = store.getMemoryIntelligence(req.params.id);
  return result ? ok(res, result) : fail(res, 404, 'Memory not found');
});
app.post('/api/memories/:id/link', (req, res) =>
  store.linkMemories(req.params.id, req.body.memoryId)
    ? ok(res, { ok: true })
    : fail(res, 400, 'Cannot link these memories'));
app.delete('/api/memories/:id/link/:otherId', (req, res) =>
  store.unlinkMemories(req.params.id, req.params.otherId)
    ? ok(res, { ok: true })
    : fail(res, 404, 'Link not found'));
app.post('/api/memories/:id/merge', (req, res) => {
  const result = store.mergeMemories(req.params.id, req.body.sourceId);
  return result ? ok(res, result) : fail(res, 400, 'Cannot merge these memories');
});

// ----- memories -----
app.get('/api/memories', (_req, res) => ok(res, store.listMemories()));
app.get('/api/memories/:id', (req, res) => {
  const m = store.getMemory(req.params.id);
  return m ? ok(res, m) : fail(res, 404, 'Memory not found');
});
app.post('/api/memories', (req, res) => ok(res, store.createMemory(req.body)));
app.put('/api/memories/:id', (req, res) => {
  const m = store.updateMemory(req.params.id, req.body);
  return m ? ok(res, m) : fail(res, 404, 'Memory not found');
});
app.delete('/api/memories/:id', (req, res) =>
  store.deleteMemory(req.params.id) ? ok(res, { ok: true }) : fail(res, 404, 'Memory not found'),
);

// ----- entities -----
app.get('/api/entities', (_req, res) => ok(res, store.listEntities()));
app.get('/api/entities/:id', (req, res) => {
  const e = store.getEntity(req.params.id);
  return e ? ok(res, e) : fail(res, 404, 'Entity not found');
});
app.post('/api/entities', (req, res) => ok(res, store.createEntity(req.body)));
app.put('/api/entities/:id', (req, res) => {
  const e = store.updateEntity(req.params.id, req.body);
  return e ? ok(res, e) : fail(res, 404, 'Entity not found');
});
app.delete('/api/entities/:id', (req, res) =>
  store.deleteEntity(req.params.id) ? ok(res, { ok: true }) : fail(res, 404, 'Entity not found'),
);

// ----- relationships -----
app.get('/api/relationships', (_req, res) => ok(res, store.listRelationships()));
app.post('/api/relationships', (req, res) => ok(res, store.createRelationship(req.body)));
app.put('/api/relationships/:id', (req, res) => {
  const r = store.updateRelationship(req.params.id, req.body);
  return r ? ok(res, r) : fail(res, 404, 'Relationship not found');
});
app.delete('/api/relationships/:id', (req, res) =>
  store.deleteRelationship(req.params.id) ? ok(res, { ok: true }) : fail(res, 404, 'Relationship not found'),
);

// ----- backup / export -----
app.get('/api/backup/export', (_req, res) => {
  res.setHeader('Content-Disposition', 'attachment; filename="opencode-brain-backup.json"');
  res.setHeader('Content-Type', 'application/json');
  return res.send(JSON.stringify(store.exportBackup(), null, 2));
});
app.post('/api/backup/import', (req, res) => {
  if (!req.body || !Array.isArray(req.body.entities)) {
    return fail(res, 400, 'Invalid backup file');
  }
  return ok(res, store.importBackup(req.body));
});

// Serve built client in production.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, '../client');
app.use(express.static(clientDist));
app.get('*', (_req, res) => {
  const index = path.join(clientDist, 'index.html');
  if (fs.existsSync(index)) return res.sendFile(index);
  return res.status(404).json({ error: 'Not found' });
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
app.listen(PORT, () => {
  console.log(`OpenCode Brain server listening on http://localhost:${PORT}`);
});

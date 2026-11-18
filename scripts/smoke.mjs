// Quick API smoke test. Run against a local server with: node scripts/smoke.mjs
const base = 'http://localhost:3001/api';

async function call(path, init) {
  const res = await fetch(base + path, {
    ...init,
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}

const health = await call('/health');
console.log('health:', health.status);

const stats = await call('/stats');
console.log('stats (seeded):', stats);

const graph = await call('/graph');
console.log('graph:', graph.nodes.length, 'nodes,', graph.edges.length, 'edges,', graph.memories.length, 'memories');

const entity = await call('/entities', {
  method: 'POST',
  body: JSON.stringify({ name: 'Smoke Test Node', type: 'concept', description: 'created by smoke test' }),
});
const memory = await call('/memories', {
  method: 'POST',
  body: JSON.stringify({
    type: 'note', title: 'Smoke Test Memory', content: 'round trip', tags: ['smoke'],
    entityIds: [entity.id],
  }),
});
const context = await call(`/entities/${entity.id}/context`);
console.log('entity context: neighbors', context.neighbors.length, 'memories', context.memories.length);

const backup = await call('/backup/export');
console.log('backup:', backup.entities.length, 'entities,', backup.memories.length, 'memories');

await call(`/memories/${memory.id}`, { method: 'DELETE' });
await call(`/entities/${entity.id}`, { method: 'DELETE' });
const after = await call('/stats');
console.log('stats (after cleanup):', after);
console.log('SMOKE TEST PASSED');

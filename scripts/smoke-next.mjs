// Smoke test for iteration 2: timeline, intelligence, links, merge.
const base = 'http://localhost:3001/api';

async function call(path, init) {
  const res = await fetch(base + path, {
    ...init,
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}

const timeline = await call('/timeline');
console.log('timeline entries:', timeline.length, '| actions:', [...new Set(timeline.map((e) => e.action))]);

const intel = await call('/intelligence');
console.log('intelligence stats:', intel.stats);

const a = await call('/memories', {
  method: 'POST',
  body: JSON.stringify({
    type: 'lesson', title: 'Debugging SQLite WAL locks',
    content: 'SQLite WAL mode can cause locked database errors when two writers run at once. Use a single connection and short transactions.',
    tags: ['debugging', 'sqlite'],
  }),
});
const b = await call('/memories', {
  method: 'POST',
  body: JSON.stringify({
    type: 'lesson', title: 'SQLite WAL lock debugging notes',
    content: 'Debugging SQLite WAL locks: locked database errors happen with two simultaneous writers. Keep one connection and use short transactions.',
    tags: ['debugging', 'sqlite'],
  }),
});

const intel2 = await call('/intelligence');
const duplicateFound = intel2.duplicates.some((c) => c.memories.some((m) => m.id === a.id) && c.memories.some((m) => m.id === b.id));
console.log('duplicate detected for near-identical pair:', duplicateFound);

await call(`/memories/${a.id}/link`, { method: 'POST', body: JSON.stringify({ memoryId: b.id }) });
const linked = await call(`/memories/${a.id}`);
console.log('relatedIds after link:', linked.relatedIds.length);

const memoryIntel = await call(`/memories/${a.id}/intelligence`);
console.log('memory intelligence: related', memoryIntel.related.length, '| entity suggestions', memoryIntel.entities.length);

const merged = await call(`/memories/${a.id}/merge`, { method: 'POST', body: JSON.stringify({ sourceId: b.id }) });
const replaced = await call(`/memories/${b.id}`);
const history = await call(`/timeline/memory/${b.id}`);
console.log('merge: target content chars', merged.content.length, '| source replaced_by', replaced.replaced_by === a.id);
console.log('source history actions:', [...new Set(history.map((h) => h.action))]);

await call(`/memories/${a.id}`, { method: 'DELETE' });
await call(`/memories/${b.id}`, { method: 'DELETE' });
console.log('SMOKE NEXT PASSED');

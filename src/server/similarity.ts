// Local, dependency-free text intelligence: TF-IDF cosine similarity used for
// duplicate detection, related-memory discovery, and entity suggestions.
import type { DuplicateCluster, Entity, EntitySuggestion, Memory, RelatedSuggestion } from '../shared/types.js';

const STOP = new Set([
  'the', 'and', 'for', 'that', 'with', 'this', 'from', 'have', 'has', 'had', 'was', 'were',
  'are', 'not', 'but', 'you', 'your', 'our', 'their', 'its', 'into', 'about', 'when', 'what',
  'how', 'why', 'which', 'who', 'all', 'any', 'can', 'could', 'would', 'should', 'will', 'just',
  'more', 'most', 'some', 'than', 'then', 'also', 'been', 'being', 'does', 'did', 'doing',
  'get', 'got', 'make', 'made', 'use', 'used', 'using', 'one', 'two', 'own', 'per', 'via',
]);

export const DUPLICATE_THRESHOLD = 0.62;
export const RELATED_THRESHOLD = 0.16;

function stem(word: string): string {
  if (word.length > 5 && word.endsWith('ing')) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith('ed')) return word.slice(0, -2);
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w))
    .map(stem);
}

export type Vector = Map<string, number>;

export function buildVectors(memories: Memory[]): Map<string, Vector> {
  const docs = memories.map((m) => {
    const counts = new Map<string, number>();
    const text = `${m.title} ${m.title} ${m.content} ${m.tags.join(' ')} ${m.type}`;
    for (const token of tokenize(text)) counts.set(token, (counts.get(token) ?? 0) + 1);
    return counts;
  });

  const df = new Map<string, number>();
  for (const doc of docs) for (const token of doc.keys()) df.set(token, (df.get(token) ?? 0) + 1);

  const n = Math.max(docs.length, 1);
  const result = new Map<string, Vector>();
  memories.forEach((m, i) => {
    const doc = docs[i];
    const total = [...doc.values()].reduce((a, b) => a + b, 0) || 1;
    const vector: Vector = new Map();
    for (const [token, count] of doc) {
      const idf = Math.log((n + 1) / ((df.get(token) ?? 0) + 1)) + 1;
      vector.set(token, (count / total) * idf);
    }
    result.set(m.id, vector);
  });
  return result;
}

export function cosine(a: Vector, b: Vector): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const value of a.values()) na += value * value;
  for (const value of b.values()) nb += value * value;
  if (!na || !nb) return 0;
  for (const [token, value] of a) {
    const other = b.get(token);
    if (other) dot += value * other;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function similarity(idA: string, idB: string, vectors: Map<string, Vector>): number {
  const a = vectors.get(idA);
  const b = vectors.get(idB);
  return a && b ? cosine(a, b) : 0;
}

export function findDuplicateClusters(memories: Memory[], vectors: Map<string, Vector>): DuplicateCluster[] {
  const parent = new Map(memories.map((m) => [m.id, m.id]));
  const find = (x: string): string => {
    let root = parent.get(x) ?? x;
    while (parent.get(root) !== root) root = parent.get(root) ?? root;
    while (parent.get(x) !== root) {
      const next = parent.get(x) ?? root;
      parent.set(x, root);
      x = next;
    }
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };

  for (let i = 0; i < memories.length; i += 1) {
    for (let j = i + 1; j < memories.length; j += 1) {
      if (similarity(memories[i].id, memories[j].id, vectors) >= DUPLICATE_THRESHOLD) {
        union(memories[i].id, memories[j].id);
      }
    }
  }

  const groups = new Map<string, Memory[]>();
  for (const m of memories) {
    const root = find(m.id);
    groups.set(root, [...(groups.get(root) ?? []), m]);
  }

  return [...groups.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([root, group], index) => {
      let best = 0;
      for (let i = 0; i < group.length; i += 1) {
        for (let j = i + 1; j < group.length; j += 1) {
          best = Math.max(best, similarity(group[i].id, group[j].id, vectors));
        }
      }
      return { id: `cluster-${index}-${root}`, memories: group, score: best };
    })
    .sort((a, b) => b.score - a.score);
}

export function relatedSuggestions(
  memory: Memory,
  memories: Memory[],
  vectors: Map<string, Vector>,
  linkedIds: Set<string>,
): RelatedSuggestion[] {
  return memories
    .filter((m) => m.id !== memory.id)
    .map((m) => ({ memory: m, score: similarity(memory.id, m.id, vectors), linked: linkedIds.has(m.id) }))
    .filter((s) => s.score >= RELATED_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

export function entitySuggestions(
  memory: Memory,
  entities: Entity[],
  memories: Memory[],
  vectors: Map<string, Vector>,
  linkedIds: Set<string>,
  duplicateThreshold: number,
): EntitySuggestion[] {
  const text = `${memory.title} ${memory.content} ${memory.tags.join(' ')}`.toLowerCase();
  const memoryTokens = new Set(tokenize(text));
  const results: EntitySuggestion[] = [];

  for (const entity of entities) {
    if (linkedIds.has(entity.id)) continue;
    const name = entity.name.toLowerCase();
    const nameTokens = tokenize(entity.name);
    let score = 0;
    let reason = '';

    if (name.length >= 3 && text.includes(name)) {
      score = 0.95;
      reason = 'Mentioned by name';
    } else if (nameTokens.length && nameTokens.every((t) => memoryTokens.has(t))) {
      score = 0.75;
      reason = 'Mentioned in content';
    } else {
      // Co-occurrence through similar memories.
      let total = 0;
      let count = 0;
      for (const other of memories) {
        if (other.id === memory.id || !other.entityIds.includes(entity.id)) continue;
        const sim = similarity(memory.id, other.id, vectors);
        if (sim >= RELATED_THRESHOLD && sim < duplicateThreshold) {
          total += sim;
          count += 1;
        }
      }
      if (count) {
        score = Math.min((total / count) * 0.8, 0.65);
        reason = `Suggested by ${count} related ${count === 1 ? 'memory' : 'memories'}`;
      }
    }
    if (score > 0) results.push({ entity, score, reason });
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 8);
}

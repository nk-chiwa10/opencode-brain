// Repository layer. All persistence goes through here so it can later be
// swapped for Graphiti / a graph database without touching the routes.
import { v4 as uuid } from 'uuid';
import { db } from './db.js';
import {
  DUPLICATE_THRESHOLD, RELATED_THRESHOLD, buildVectors, entitySuggestions,
  findDuplicateClusters, relatedSuggestions, similarity,
} from './similarity.js';
import type {
  BackupData,
  Entity,
  EntityContext,
  GraphData,
  HistoryAction,
  HistoryEntry,
  IntelligenceReport,
  Memory,
  MemoryIntelligence,
  Relationship,
} from '../shared/types.js';

const now = () => new Date().toISOString();

// ---------- row mappers ----------
type MemoryRow = Omit<Memory, 'tags' | 'entityIds' | 'relatedIds'> & { tags: string };
type EntityRow = Omit<Entity, 'properties'> & { properties: string };

function mapMemory(row: MemoryRow): Memory {
  const linked = db
    .prepare('SELECT entity_id FROM memory_entities WHERE memory_id = ?')
    .all(row.id) as Array<{ entity_id: string }>;
  const related = db
    .prepare('SELECT a_id, b_id FROM memory_links WHERE a_id = ? OR b_id = ?')
    .all(row.id, row.id) as Array<{ a_id: string; b_id: string }>;
  return {
    ...row,
    tags: safeJson(row.tags, []),
    entityIds: linked.map((l) => l.entity_id),
    relatedIds: related.map((l) => (l.a_id === row.id ? l.b_id : l.a_id)),
  };
}

function mapEntity(row: EntityRow): Entity {
  return { ...row, properties: safeJson(row.properties, {}) };
}

function safeJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

// ---------- history ----------
function recordHistory(
  subjectType: 'memory' | 'entity',
  subjectId: string,
  action: HistoryAction,
  snapshot: unknown,
  note: string | null = null,
) {
  db.prepare(
    `INSERT INTO history (id, subject_type, subject_id, action, snapshot, note, created_at)
     VALUES (@id, @subject_type, @subject_id, @action, @snapshot, @note, @created_at)`,
  ).run({
    id: uuid(),
    subject_type: subjectType,
    subject_id: subjectId,
    action,
    snapshot: JSON.stringify(snapshot),
    note,
    created_at: now(),
  });
}

type HistoryRow = Omit<HistoryEntry, 'snapshot'> & { snapshot: string };

function mapHistory(row: HistoryRow): HistoryEntry {
  const snap = safeJson<Record<string, unknown>>(row.snapshot, {});
  return { ...row, snapshot: snap, subject_name: String(snap.title ?? snap.name ?? 'Unknown') };
}

export function getTimeline(limit = 120, subjectType?: string, action?: string): HistoryEntry[] {
  const clauses: string[] = [];
  const params: Record<string, unknown> = { limit };
  if (subjectType) { clauses.push('subject_type = @subjectType'); params.subjectType = subjectType; }
  if (action) { clauses.push('action = @action'); params.action = action; }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db
    .prepare(`SELECT * FROM history ${where} ORDER BY created_at DESC, rowid DESC LIMIT @limit`)
    .all(params) as HistoryRow[];
  return rows.map(mapHistory);
}

export function getSubjectHistory(subjectType: string, subjectId: string): HistoryEntry[] {
  const rows = db
    .prepare('SELECT * FROM history WHERE subject_type = ? AND subject_id = ? ORDER BY created_at DESC, rowid DESC')
    .all(subjectType, subjectId) as HistoryRow[];
  return rows.map(mapHistory);
}

// ---------- memories ----------
export function listMemories(): Memory[] {
  const rows = db
    .prepare('SELECT * FROM memories WHERE replaced_by IS NULL ORDER BY updated_at DESC')
    .all() as MemoryRow[];
  return rows.map(mapMemory);
}

export function getMemory(id: string): Memory | undefined {
  const row = db.prepare('SELECT * FROM memories WHERE id = ?').get(id) as MemoryRow | undefined;
  return row ? mapMemory(row) : undefined;
}

export interface MemoryInput {
  type: string;
  title: string;
  content: string;
  tags: string[];
  source?: string | null;
  entityIds?: string[];
}

export function createMemory(input: MemoryInput): Memory {
  const id = uuid();
  const ts = now();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO memories (id, type, title, content, tags, source, replaced_by, created_at, updated_at)
       VALUES (@id, @type, @title, @content, @tags, @source, NULL, @created_at, @updated_at)`,
    ).run({
      id,
      type: input.type,
      title: input.title,
      content: input.content,
      tags: JSON.stringify(input.tags ?? []),
      source: input.source ?? null,
      created_at: ts,
      updated_at: ts,
    });
    linkMemoryEntities(id, input.entityIds ?? []);
    recordHistory('memory', id, 'created', getMemory(id), null);
  })();
  return getMemory(id)!;
}

export function updateMemory(id: string, input: Partial<MemoryInput>): Memory | undefined {
  const existing = getMemory(id);
  if (!existing) return undefined;
  db.transaction(() => {
    db.prepare(
      `UPDATE memories SET type=@type, title=@title, content=@content, tags=@tags,
       source=@source, updated_at=@updated_at WHERE id=@id`,
    ).run({
      id,
      type: input.type ?? existing.type,
      title: input.title ?? existing.title,
      content: input.content ?? existing.content,
      tags: JSON.stringify(input.tags ?? existing.tags),
      source: input.source !== undefined ? input.source : existing.source,
      updated_at: now(),
    });
    if (input.entityIds !== undefined) {
      db.prepare('DELETE FROM memory_entities WHERE memory_id = ?').run(id);
      linkMemoryEntities(id, input.entityIds);
    }
    recordHistory('memory', id, 'updated', getMemory(id), 'Memory edited');
  })();
  return getMemory(id);
}

export function deleteMemory(id: string): boolean {
  const memory = getMemory(id);
  if (!memory) return false;
  db.transaction(() => {
    recordHistory('memory', id, 'deleted', memory, 'Memory deleted');
    db.prepare('DELETE FROM memories WHERE id = ?').run(id);
  })();
  return true;
}

export function mergeMemories(targetId: string, sourceId: string): Memory | undefined {
  if (targetId === sourceId) return undefined;
  const target = getMemory(targetId);
  const source = getMemory(sourceId);
  if (!target || !source || source.replaced_by) return undefined;

  db.transaction(() => {
    const combinedContent = [target.content.trim(), `--- Merged from "${source.title}" ---`, source.content.trim()]
      .filter(Boolean).join('\n\n');
    const tags = [...new Set([...target.tags, ...source.tags])];
    const entityIds = [...new Set([...target.entityIds, ...source.entityIds])];

    db.prepare(
      `UPDATE memories SET content=@content, tags=@tags, updated_at=@updated_at WHERE id=@id`,
    ).run({ id: targetId, content: combinedContent, tags: JSON.stringify(tags), updated_at: now() });
    db.prepare('DELETE FROM memory_entities WHERE memory_id = ?').run(targetId);
    linkMemoryEntities(targetId, entityIds);

    db.prepare('UPDATE memories SET replaced_by = ?, updated_at = ? WHERE id = ?')
      .run(targetId, now(), sourceId);
    recordHistory('memory', sourceId, 'replaced', getMemory(sourceId), `Merged into "${target.title}"`);
    recordHistory('memory', targetId, 'updated', getMemory(targetId), `Merged "${source.title}"`);
  })();
  return getMemory(targetId);
}

function linkMemoryEntities(memoryId: string, entityIds: string[]) {
  const insert = db.prepare(
    'INSERT OR IGNORE INTO memory_entities (memory_id, entity_id) VALUES (?, ?)',
  );
  for (const entityId of new Set(entityIds)) {
    if (db.prepare('SELECT 1 FROM entities WHERE id = ?').get(entityId)) {
      insert.run(memoryId, entityId);
    }
  }
}

// ---------- memory links ----------
export function linkMemories(a: string, b: string): boolean {
  if (a === b) return false;
  const [aId, bId] = a < b ? [a, b] : [b, a];
  if (!getMemory(aId) || !getMemory(bId)) return false;
  db.prepare(
    'INSERT OR IGNORE INTO memory_links (a_id, b_id, type, created_at) VALUES (?, ?, ?, ?)',
  ).run(aId, bId, 'related', now());
  return true;
}

export function unlinkMemories(a: string, b: string): boolean {
  const [aId, bId] = a < b ? [a, b] : [b, a];
  return db.prepare('DELETE FROM memory_links WHERE a_id = ? AND b_id = ?').run(aId, bId).changes > 0;
}

// ---------- entities ----------
export function listEntities(): Entity[] {
  const rows = db.prepare('SELECT * FROM entities ORDER BY name COLLATE NOCASE').all() as EntityRow[];
  return rows.map(mapEntity);
}

export function getEntity(id: string): Entity | undefined {
  const row = db.prepare('SELECT * FROM entities WHERE id = ?').get(id) as EntityRow | undefined;
  return row ? mapEntity(row) : undefined;
}

export interface EntityInput {
  name: string;
  type: string;
  description: string;
  properties?: Record<string, unknown>;
}

export function createEntity(input: EntityInput): Entity {
  const id = uuid();
  const ts = now();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO entities (id, name, type, description, properties, created_at, updated_at)
       VALUES (@id, @name, @type, @description, @properties, @created_at, @updated_at)`,
    ).run({
      id,
      name: input.name,
      type: input.type,
      description: input.description,
      properties: JSON.stringify(input.properties ?? {}),
      created_at: ts,
      updated_at: ts,
    });
    recordHistory('entity', id, 'created', getEntity(id), null);
  })();
  return getEntity(id)!;
}

export function updateEntity(id: string, input: Partial<EntityInput>): Entity | undefined {
  const existing = getEntity(id);
  if (!existing) return undefined;
  db.prepare(
    `UPDATE entities SET name=@name, type=@type, description=@description,
     properties=@properties, updated_at=@updated_at WHERE id=@id`,
  ).run({
    id,
    name: input.name ?? existing.name,
    type: input.type ?? existing.type,
    description: input.description ?? existing.description,
    properties: JSON.stringify(input.properties ?? existing.properties),
    updated_at: now(),
  });
  recordHistory('entity', id, 'updated', getEntity(id), 'Entity edited');
  return getEntity(id);
}

export function deleteEntity(id: string): boolean {
  const entity = getEntity(id);
  if (!entity) return false;
  db.transaction(() => {
    recordHistory('entity', id, 'deleted', entity, 'Entity deleted');
    db.prepare('DELETE FROM entities WHERE id = ?').run(id);
  })();
  return true;
}

// ---------- relationships ----------
export function listRelationships(): Relationship[] {
  return db.prepare('SELECT * FROM relationships ORDER BY created_at DESC').all() as Relationship[];
}

export interface RelationshipInput {
  source_id: string;
  target_id: string;
  type: string;
  description?: string;
  weight?: number;
}

export function createRelationship(input: RelationshipInput): Relationship {
  const id = uuid();
  db.prepare(
    `INSERT INTO relationships (id, source_id, target_id, type, description, weight, created_at)
     VALUES (@id, @source_id, @target_id, @type, @description, @weight, @created_at)`,
  ).run({
    id,
    source_id: input.source_id,
    target_id: input.target_id,
    type: input.type,
    description: input.description ?? '',
    weight: input.weight ?? 1,
    created_at: now(),
  });
  return db.prepare('SELECT * FROM relationships WHERE id = ?').get(id) as Relationship;
}

export function updateRelationship(
  id: string,
  input: Partial<RelationshipInput>,
): Relationship | undefined {
  const existing = db.prepare('SELECT * FROM relationships WHERE id = ?').get(id) as
    | Relationship
    | undefined;
  if (!existing) return undefined;
  db.prepare(
    `UPDATE relationships SET source_id=@source_id, target_id=@target_id, type=@type,
     description=@description, weight=@weight WHERE id=@id`,
  ).run({
    id,
    source_id: input.source_id ?? existing.source_id,
    target_id: input.target_id ?? existing.target_id,
    type: input.type ?? existing.type,
    description: input.description ?? existing.description,
    weight: input.weight ?? existing.weight,
  });
  return db.prepare('SELECT * FROM relationships WHERE id = ?').get(id) as Relationship;
}

export function deleteRelationship(id: string): boolean {
  return db.prepare('DELETE FROM relationships WHERE id = ?').run(id).changes > 0;
}

// ---------- graph / context ----------
export function getGraph(): GraphData {
  const nodes = listEntities().map((entity) => ({
    ...entity,
    connections: countConnections(entity.id),
  }));
  const edges = listRelationships().map((rel) => ({
    id: rel.id,
    source: rel.source_id,
    target: rel.target_id,
    type: rel.type,
    label: rel.type,
    weight: rel.weight,
  }));
  return { nodes, edges, memories: listMemories() };
}

function countConnections(id: string): number {
  const row = db.prepare('SELECT COUNT(*) AS n FROM relationships WHERE source_id = ? OR target_id = ?')
    .get(id, id) as { n: number };
  return row.n;
}

export function getEntityContext(id: string): EntityContext | undefined {
  const entity = getEntity(id);
  if (!entity) return undefined;
  const rels = db.prepare('SELECT * FROM relationships WHERE source_id = ? OR target_id = ?').all(id, id) as Relationship[];
  const neighbors = rels.map((relationship) => {
    const direction = relationship.source_id === id ? 'out' : 'in';
    const neighborId = direction === 'out' ? relationship.target_id : relationship.source_id;
    return { entity: getEntity(neighborId)!, relationship, direction: direction as 'out' | 'in' };
  }).filter((n) => n.entity);
  const memRows = db.prepare(
    `SELECT m.* FROM memories m JOIN memory_entities me ON me.memory_id = m.id
     WHERE me.entity_id = ? AND m.replaced_by IS NULL ORDER BY m.updated_at DESC`,
  ).all(id) as MemoryRow[];
  return { entity, neighbors, memories: memRows.map(mapMemory) };
}

// ---------- intelligence ----------
function intelligenceBase() {
  const memories = listMemories();
  return { memories, vectors: buildVectors(memories) };
}

export function getIntelligence(): IntelligenceReport {
  const { memories, vectors } = intelligenceBase();
  const duplicates = findDuplicateClusters(memories, vectors);

  const connections: IntelligenceReport['connections'] = [];
  for (let i = 0; i < memories.length; i += 1) {
    for (let j = i + 1; j < memories.length; j += 1) {
      const score = similarity(memories[i].id, memories[j].id, vectors);
      if (score >= RELATED_THRESHOLD && score < DUPLICATE_THRESHOLD) {
        const linked = !!db.prepare(
          'SELECT 1 FROM memory_links WHERE (a_id = ? AND b_id = ?) OR (a_id = ? AND b_id = ?)',
        ).get(memories[i].id, memories[j].id, memories[j].id, memories[i].id);
        connections.push({ a: memories[i], b: memories[j], score, linked });
      }
    }
  }
  connections.sort((x, y) => Number(y.linked) - Number(x.linked) || y.score - x.score);

  return {
    duplicates,
    connections: connections.slice(0, 40),
    stats: {
      analyzed: memories.length,
      duplicateGroups: duplicates.length,
      suggestions: connections.filter((c) => !c.linked).length,
    },
  };
}

export function getMemoryIntelligence(id: string): MemoryIntelligence | undefined {
  const memory = getMemory(id);
  if (!memory) return undefined;
  const { memories, vectors } = intelligenceBase();
  const related = relatedSuggestions(memory, memories, vectors, new Set(memory.relatedIds));
  const entities = entitySuggestions(
    memory, listEntities(), memories, vectors, new Set(memory.entityIds), DUPLICATE_THRESHOLD,
  );
  return { memory, related, entities };
}

// ---------- backup / restore ----------
export function exportBackup(): BackupData {
  const memoryEntities = db.prepare('SELECT memory_id, entity_id FROM memory_entities')
    .all() as Array<{ memory_id: string; entity_id: string }>;
  const memoryLinks = db.prepare('SELECT a_id, b_id, type, created_at FROM memory_links')
    .all() as BackupData['memoryLinks'];
  return {
    version: 2,
    exported_at: now(),
    memories: listMemories(),
    entities: listEntities(),
    relationships: listRelationships(),
    memoryEntities,
    memoryLinks,
    history: getTimeline(Number.MAX_SAFE_INTEGER),
  };
}

export function importBackup(data: BackupData) {
  const counts = {
    memories: data.memories?.length ?? 0,
    entities: data.entities?.length ?? 0,
    relationships: data.relationships?.length ?? 0,
  };
  db.transaction(() => {
    db.exec(`DELETE FROM memory_links; DELETE FROM memory_entities; DELETE FROM relationships;
             DELETE FROM history; DELETE FROM memories; DELETE FROM entities;`);

    const insertEntity = db.prepare(
      `INSERT INTO entities (id, name, type, description, properties, created_at, updated_at)
       VALUES (@id, @name, @type, @description, @properties, @created_at, @updated_at)`,
    );
    for (const e of data.entities ?? []) {
      insertEntity.run({
        id: e.id, name: e.name, type: e.type, description: e.description ?? '',
        properties: JSON.stringify(e.properties ?? {}),
        created_at: e.created_at ?? now(), updated_at: e.updated_at ?? now(),
      });
    }

    const insertMemory = db.prepare(
      `INSERT INTO memories (id, type, title, content, tags, source, replaced_by, created_at, updated_at)
       VALUES (@id, @type, @title, @content, @tags, @source, @replaced_by, @created_at, @updated_at)`,
    );
    for (const m of data.memories ?? []) {
      insertMemory.run({
        id: m.id, type: m.type, title: m.title, content: m.content ?? '',
        tags: JSON.stringify(m.tags ?? []), source: m.source ?? null,
        replaced_by: m.replaced_by ?? null,
        created_at: m.created_at ?? now(), updated_at: m.updated_at ?? now(),
      });
    }

    const insertRel = db.prepare(
      `INSERT INTO relationships (id, source_id, target_id, type, description, weight, created_at)
       VALUES (@id, @source_id, @target_id, @type, @description, @weight, @created_at)`,
    );
    for (const r of data.relationships ?? []) {
      insertRel.run({
        id: r.id, source_id: r.source_id, target_id: r.target_id, type: r.type,
        description: r.description ?? '', weight: r.weight ?? 1, created_at: r.created_at ?? now(),
      });
    }

    const insertLink = db.prepare('INSERT OR IGNORE INTO memory_entities (memory_id, entity_id) VALUES (?, ?)');
    for (const link of data.memoryEntities ?? []) insertLink.run(link.memory_id, link.entity_id);

    const insertMemoryLink = db.prepare(
      'INSERT OR IGNORE INTO memory_links (a_id, b_id, type, created_at) VALUES (?, ?, ?, ?)',
    );
    for (const link of data.memoryLinks ?? []) {
      insertMemoryLink.run(link.a_id, link.b_id, link.type ?? 'related', link.created_at ?? now());
    }

    const insertHistory = db.prepare(
      `INSERT INTO history (id, subject_type, subject_id, action, snapshot, note, created_at)
       VALUES (@id, @subject_type, @subject_id, @action, @snapshot, @note, @created_at)`,
    );
    for (const h of data.history ?? []) {
      insertHistory.run({
        id: h.id ?? uuid(), subject_type: h.subject_type, subject_id: h.subject_id,
        action: h.action, snapshot: JSON.stringify(h.snapshot ?? {}), note: h.note ?? null,
        created_at: h.created_at ?? now(),
      });
    }
  })();
  return counts;
}

// One-time backfill so brains created before history tracking still show a timeline.
export function backfillHistory() {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM history').get() as { n: number };
  if (n > 0) return;
  const insert = db.prepare(
    `INSERT INTO history (id, subject_type, subject_id, action, snapshot, note, created_at)
     VALUES (@id, @subject_type, @subject_id, @action, @snapshot, @note, @created_at)`,
  );
  const mems = db.prepare('SELECT * FROM memories').all() as Array<Record<string, unknown>>;
  for (const m of mems) {
    insert.run({
      id: uuid(), subject_type: 'memory', subject_id: m.id, action: 'created',
      snapshot: JSON.stringify(m), note: 'Imported from existing brain', created_at: m.created_at ?? now(),
    });
  }
  const ents = db.prepare('SELECT * FROM entities').all() as Array<Record<string, unknown>>;
  for (const e of ents) {
    insert.run({
      id: uuid(), subject_type: 'entity', subject_id: e.id, action: 'created',
      snapshot: JSON.stringify(e), note: 'Imported from existing brain', created_at: e.created_at ?? now(),
    });
  }
}

export function stats() {
  const count = (table: string) =>
    (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
  return {
    memories: (db.prepare('SELECT COUNT(*) AS n FROM memories WHERE replaced_by IS NULL').get() as { n: number }).n,
    entities: count('entities'),
    relationships: count('relationships'),
    links: count('memory_entities'),
    memoryLinks: count('memory_links'),
    history: count('history'),
  };
}

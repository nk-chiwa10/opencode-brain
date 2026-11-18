// Shared domain types used by both the server and the client.

export type MemoryType =
  | 'conversation'
  | 'decision'
  | 'project-context'
  | 'mistake'
  | 'lesson'
  | 'note';

export type EntityType =
  | 'person'
  | 'project'
  | 'technology'
  | 'concept'
  | 'decision'
  | 'organization'
  | 'location'
  | 'event';

export interface Memory {
  id: string;
  type: MemoryType;
  title: string;
  content: string;
  tags: string[];
  source: string | null;
  replaced_by: string | null;
  created_at: string;
  updated_at: string;
  entityIds: string[];
  relatedIds: string[];
}

export interface Entity {
  id: string;
  name: string;
  type: EntityType;
  description: string;
  properties: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Relationship {
  id: string;
  source_id: string;
  target_id: string;
  type: string;
  description: string;
  weight: number;
  created_at: string;
}

export interface GraphNode extends Entity {
  // React Flow reads `position`; we compute it on the client from a layout.
  connections: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  label: string;
  weight: number;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  memories: Memory[];
}

export interface EntityContext {
  entity: Entity;
  neighbors: Array<{ entity: Entity; relationship: Relationship; direction: 'out' | 'in' }>;
  memories: Memory[];
}

export interface MemoryLink {
  a_id: string;
  b_id: string;
  type: string;
  created_at: string;
}

export type HistoryAction = 'created' | 'updated' | 'replaced' | 'deleted';

export interface HistoryEntry {
  id: string;
  subject_type: 'memory' | 'entity';
  subject_id: string;
  action: HistoryAction;
  snapshot: Record<string, unknown>;
  note: string | null;
  created_at: string;
  subject_name: string;
}

export interface DuplicateCluster {
  id: string;
  memories: Memory[];
  score: number;
}

export interface RelatedSuggestion {
  memory: Memory;
  score: number;
  linked: boolean;
}

export interface EntitySuggestion {
  entity: Entity;
  score: number;
  reason: string;
}

export interface MemoryIntelligence {
  memory: Memory;
  related: RelatedSuggestion[];
  entities: EntitySuggestion[];
}

export interface IntelligenceReport {
  duplicates: DuplicateCluster[];
  connections: Array<{ a: Memory; b: Memory; score: number; linked: boolean }>;
  stats: { analyzed: number; duplicateGroups: number; suggestions: number };
}

export interface BackupData {
  version: number;
  exported_at: string;
  memories: Memory[];
  entities: Entity[];
  relationships: Relationship[];
  memoryEntities: Array<{ memory_id: string; entity_id: string }>;
  memoryLinks: MemoryLink[];
  history: HistoryEntry[];
}

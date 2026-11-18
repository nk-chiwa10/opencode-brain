import type {
  BackupData,
  Entity,
  EntityContext,
  GraphData,
  HistoryEntry,
  IntelligenceReport,
  Memory,
  MemoryIntelligence,
  Relationship,
} from '../shared/types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  graph: () => request<GraphData>('/graph'),
  stats: () => request<Record<string, number>>('/stats'),
  entityContext: (id: string) => request<EntityContext>(`/entities/${id}/context`),

  memories: () => request<Memory[]>('/memories'),
  createMemory: (data: Partial<Memory>) =>
    request<Memory>('/memories', { method: 'POST', body: JSON.stringify(data) }),
  updateMemory: (id: string, data: Partial<Memory>) =>
    request<Memory>(`/memories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteMemory: (id: string) => request<{ ok: boolean }>(`/memories/${id}`, { method: 'DELETE' }),

  entities: () => request<Entity[]>('/entities'),
  createEntity: (data: Partial<Entity>) =>
    request<Entity>('/entities', { method: 'POST', body: JSON.stringify(data) }),
  updateEntity: (id: string, data: Partial<Entity>) =>
    request<Entity>(`/entities/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteEntity: (id: string) => request<{ ok: boolean }>(`/entities/${id}`, { method: 'DELETE' }),

  relationships: () => request<Relationship[]>('/relationships'),
  createRelationship: (data: Partial<Relationship>) =>
    request<Relationship>('/relationships', { method: 'POST', body: JSON.stringify(data) }),
  updateRelationship: (id: string, data: Partial<Relationship>) =>
    request<Relationship>(`/relationships/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteRelationship: (id: string) =>
    request<{ ok: boolean }>(`/relationships/${id}`, { method: 'DELETE' }),

  timeline: (limit = 120, type?: string, action?: string) =>
    request<HistoryEntry[]>(`/timeline?limit=${limit}${type ? `&type=${type}` : ''}${action ? `&action=${action}` : ''}`),
  subjectHistory: (type: string, id: string) => request<HistoryEntry[]>(`/timeline/${type}/${id}`),

  intelligence: () => request<IntelligenceReport>('/intelligence'),
  memoryIntelligence: (id: string) => request<MemoryIntelligence>(`/memories/${id}/intelligence`),
  linkMemories: (id: string, memoryId: string) =>
    request<{ ok: boolean }>(`/memories/${id}/link`, { method: 'POST', body: JSON.stringify({ memoryId }) }),
  unlinkMemories: (id: string, otherId: string) =>
    request<{ ok: boolean }>(`/memories/${id}/link/${otherId}`, { method: 'DELETE' }),
  mergeMemories: (targetId: string, sourceId: string) =>
    request<Memory>(`/memories/${targetId}/merge`, { method: 'POST', body: JSON.stringify({ sourceId }) }),

  exportBackup: () => request<BackupData>('/backup/export'),
  importBackup: (data: BackupData) =>
    request<{ memories: number; entities: number; relationships: number }>('/backup/import', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

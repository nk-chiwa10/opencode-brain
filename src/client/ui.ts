import type { EntityType, MemoryType } from '../shared/types';

export const ENTITY_TYPES: EntityType[] = [
  'person', 'project', 'technology', 'concept', 'decision', 'organization', 'location', 'event',
];

export const MEMORY_TYPES: MemoryType[] = [
  'conversation', 'decision', 'project-context', 'mistake', 'lesson', 'note',
];

export const ENTITY_COLORS: Record<string, string> = {
  person: '#f5a524',
  project: '#a78bfa',
  technology: '#4f8cff',
  concept: '#2dd4a7',
  decision: '#f2637f',
  organization: '#22b8cf',
  location: '#a3e635',
  event: '#e879f9',
};

export const MEMORY_COLORS: Record<string, string> = {
  conversation: '#4f8cff',
  decision: '#f2637f',
  'project-context': '#a78bfa',
  mistake: '#f5a524',
  lesson: '#2dd4a7',
  note: '#7c8aa5',
};

export function colorFor(kind: 'entity' | 'memory', type: string): string {
  return (kind === 'entity' ? ENTITY_COLORS[type] : MEMORY_COLORS[type]) ?? '#7c8aa5';
}

export function pretty(type: string): string {
  return type.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

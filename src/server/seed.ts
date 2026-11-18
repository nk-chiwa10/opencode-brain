// Seed a small demo brain on first run so the visualization is immediately useful.
import { stats, createEntity, createMemory, createRelationship } from './store.js';

export function seedIfEmpty() {
  if (stats().entities > 0) return;

  const e = {
    opencode: createEntity({ name: 'OpenCode', type: 'technology', description: 'An open-source AI coding agent harness.' }).id,
    brain: createEntity({ name: 'OpenCode Brain', type: 'project', description: 'A local memory engine, knowledge graph, and visual brain built on OpenCode.' }).id,
    react: createEntity({ name: 'React', type: 'technology', description: 'UI library used for the Visual Brain.' }).id,
    sqlite: createEntity({ name: 'SQLite', type: 'technology', description: 'Local persistent storage for the Memory Engine.' }).id,
    graphiti: createEntity({ name: 'Graphiti', type: 'technology', description: 'Planned future integration for temporal knowledge graphs.' }).id,
    falkordb: createEntity({ name: 'FalkorDB', type: 'technology', description: 'Planned future graph-database backend.' }).id,
    you: createEntity({ name: 'You', type: 'person', description: 'The builder and owner of this brain.' }).id,
    mvp: createEntity({ name: 'Full working MVP', type: 'decision', description: 'Build all three cores with manual data entry before AI extraction.' }).id,
    kg: createEntity({ name: 'Knowledge Graph', type: 'concept', description: 'Entities connected by typed relationships.' }).id,
    memory: createEntity({ name: 'Memory Engine', type: 'concept', description: 'Stores conversations, decisions, context, mistakes and lessons.' }).id,
    visual: createEntity({ name: 'Visual Brain', type: 'concept', description: 'Interactive exploration of stored knowledge.' }).id,
  };

  createRelationship({ source_id: e.brain, target_id: e.opencode, type: 'built_on', description: 'Built on top of OpenCode.' });
  createRelationship({ source_id: e.brain, target_id: e.react, type: 'uses' });
  createRelationship({ source_id: e.brain, target_id: e.sqlite, type: 'uses' });
  createRelationship({ source_id: e.brain, target_id: e.graphiti, type: 'planned_integration' });
  createRelationship({ source_id: e.brain, target_id: e.falkordb, type: 'planned_integration' });
  createRelationship({ source_id: e.you, target_id: e.brain, type: 'owns' });
  createRelationship({ source_id: e.brain, target_id: e.mvp, type: 'decided' });
  createRelationship({ source_id: e.brain, target_id: e.kg, type: 'has_core' });
  createRelationship({ source_id: e.brain, target_id: e.memory, type: 'has_core' });
  createRelationship({ source_id: e.brain, target_id: e.visual, type: 'has_core' });
  createRelationship({ source_id: e.kg, target_id: e.visual, type: 'visualized_by' });
  createRelationship({ source_id: e.memory, target_id: e.kg, type: 'feeds' });
  createRelationship({ source_id: e.you, target_id: e.mvp, type: 'decided' });

  createMemory({
    type: 'project-context',
    title: 'OpenCode Brain kickoff',
    content: 'Define OpenCode Brain with three cores: a Memory Engine, a Knowledge Graph, and a Visual Brain. Keep everything local and modular so Graphiti and FalkorDB can be added later.',
    tags: ['kickoff', 'architecture'],
    source: 'project brief',
    entityIds: [e.brain, e.opencode, e.mvp, e.kg, e.memory, e.visual, e.graphiti, e.falkordb],
  });
  createMemory({
    type: 'decision',
    title: 'Stack: React + Express + SQLite',
    content: 'Use React + TypeScript with React Flow, Node + Express, and SQLite for persistence. JSON import/export for portability. Manual entry first; AI extraction and OpenCode MCP integration in later phases.',
    tags: ['stack', 'decision'],
    entityIds: [e.brain, e.react, e.sqlite, e.mvp],
  });
  createMemory({
    type: 'lesson',
    title: 'Start manual, automate later',
    content: 'Manually added memories and relationships are enough to validate the model. Do not build automatic AI memory extraction until manual flows feel right.',
    tags: ['lesson', 'scope'],
    entityIds: [e.mvp, e.memory, e.you],
  });
}

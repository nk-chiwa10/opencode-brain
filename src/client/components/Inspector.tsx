import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import {
  Save, Trash2, Link2, Unlink, ArrowRight, ArrowLeft, Network, FileText, CircleDot,
  Plus, Sparkles, History, Replace,
} from 'lucide-react';
import type {
  Entity, EntityContext, EntityType, HistoryEntry, Memory, MemoryIntelligence, MemoryType, Relationship,
} from '../../shared/types';
import { ENTITY_TYPES, MEMORY_TYPES, colorFor, pretty } from '../ui';
import type { Selection } from './Sidebar';

interface Props {
  selection: Selection;
  entities: Entity[];
  memories: Memory[];
  relationships: Relationship[];
  context: EntityContext | null;
  intelligence: MemoryIntelligence | null;
  history: HistoryEntry[];
  stats: Record<string, number> | null;
  onSelect: (s: Selection) => void;
  onUpdateEntity: (id: string, data: Partial<Entity>) => Promise<void>;
  onUpdateMemory: (id: string, data: Partial<Memory>) => Promise<void>;
  onUpdateRelationship: (id: string, data: Partial<Relationship>) => Promise<void>;
  onDelete: (kind: 'memory' | 'entity' | 'relationship', id: string) => void;
  onLinkEntity: (memoryId: string, entityId: string) => Promise<void>;
  onUnlinkEntity: (memoryId: string, entityId: string) => Promise<void>;
  onLinkMemory: (memoryId: string, otherId: string) => void;
  onUnlinkMemory: (memoryId: string, otherId: string) => void;
  onNewRelationship: (sourceId?: string) => void;
}

export default function Inspector(props: Props) {
  const { selection } = props;
  if (!selection) return <Overview {...props} />;
  if (selection.kind === 'entity') return <EntityInspector {...props} id={selection.id} />;
  if (selection.kind === 'memory') return <MemoryInspector {...props} id={selection.id} />;
  return <RelationshipInspector {...props} id={selection.id} />;
}

function Overview({ stats, onNewRelationship }: Props) {
  return (
    <section className="inspector">
      <div className="inspector-head">
        <div className="inspector-kicker">INSPECTOR</div>
        <h2>Nothing selected</h2>
      </div>
      <div className="overview-body">
        <div className="overview-intro">
          <div className="overview-illustration"><Network size={30} /></div>
          <p>Your brain is stored locally. Pick a node in the graph or an item in the sidebar to inspect and edit it.</p>
        </div>
        {stats && (
          <div className="stat-grid">
            <Stat label="Memories" value={stats.memories ?? 0} />
            <Stat label="Entities" value={stats.entities ?? 0} />
            <Stat label="Relationships" value={stats.relationships ?? 0} />
            <Stat label="Memory links" value={stats.links ?? 0} />
          </div>
        )}
        <button className="btn secondary full" onClick={() => onNewRelationship()}>
          <Plus size={15} /> New relationship
        </button>
        <div className="tip"><Sparkles size={14} /> Tip: Connect a memory to entities to weave it into the graph.</div>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat-card">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function SectionTitle({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return <div className="section-title">{icon}{children}</div>;
}

function EntityInspector({
  id, context, entities, history, onSelect, onUpdateEntity, onDelete, onNewRelationship,
}: Props & { id: string }) {
  const entity = context?.entity ?? entities.find((e) => e.id === id);
  const [name, setName] = useState('');
  const [type, setType] = useState<EntityType>('concept');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (!entity) return;
    setName(entity.name);
    setType(entity.type);
    setDescription(entity.description);
  }, [entity]);

  if (!entity) return <NotFound />;

  const save = async () => {
    await onUpdateEntity(id, { name, type, description });
  };

  return (
    <section className="inspector">
      <div className="inspector-head entity-head" style={{ '--accent': colorFor('entity', entity.type) } as CSSProperties}>
        <div className="inspector-kicker">ENTITY</div>
        <h2>{entity.name}</h2>
        <span className="type-pill" style={{ background: colorFor('entity', entity.type) }}>{pretty(entity.type)}</span>
      </div>

      <div className="inspector-body">
        <div className="form-grid">
          <label>Name
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>Type
            <select value={type} onChange={(e) => setType(e.target.value as EntityType)}>
              {ENTITY_TYPES.map((t) => <option key={t} value={t}>{pretty(t)}</option>)}
            </select>
          </label>
          <label className="full">Description
            <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
        </div>
        <div className="action-row">
          <button className="btn primary" onClick={save}><Save size={15} /> Save changes</button>
          <button className="btn ghost danger" onClick={() => onDelete('entity', id)}><Trash2 size={15} /> Delete</button>
        </div>

        <div className="divider" />
        <SectionTitle icon={<Network size={15} />}>Connected entities ({context?.neighbors.length ?? 0})</SectionTitle>
        <div className="mini-list">
          {(context?.neighbors ?? []).map((n) => (
            <div key={n.relationship.id} className="mini-row">
              <button className="mini-link" onClick={() => onSelect({ kind: 'entity', id: n.entity.id })}>
                {n.direction === 'out' ? <ArrowRight size={13} /> : <ArrowLeft size={13} />}
                <span className="mini-name">{n.entity.name}</span>
                <span className="rel-tag">{n.relationship.type}</span>
              </button>
            </div>
          ))}
          {!context?.neighbors.length && <div className="muted">No connections yet.</div>}
        </div>
        <button className="btn secondary full small" onClick={() => onNewRelationship(id)}>
          <Plus size={14} /> Add relationship
        </button>

        <div className="divider" />
        <SectionTitle icon={<FileText size={15} />}>Linked memories ({context?.memories.length ?? 0})</SectionTitle>
        <div className="mini-list">
          {(context?.memories ?? []).map((m) => (
            <button key={m.id} className="mini-link" onClick={() => onSelect({ kind: 'memory', id: m.id })}>
              <span className="item-dot" style={{ background: colorFor('memory', m.type) }} />
              <span className="mini-name">{m.title}</span>
            </button>
          ))}
          {!context?.memories.length && <div className="muted">No memories linked.</div>}
        </div>

        <div className="divider" />
        <SectionTitle icon={<History size={15} />}>History</SectionTitle>
        <HistoryList entries={history.slice(0, 6)} />
      </div>
    </section>
  );
}

function MemoryInspector({
  id, memories, entities, onSelect, onUpdateMemory, onDelete, onLinkEntity, onUnlinkEntity,
  intelligence, history, onLinkMemory, onUnlinkMemory,
}: Props & { id: string }) {
  const memory = memories.find((m) => m.id === id);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<MemoryType>('note');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const [source, setSource] = useState('');
  const [linkId, setLinkId] = useState('');

  useEffect(() => {
    if (!memory) return;
    setTitle(memory.title);
    setType(memory.type);
    setContent(memory.content);
    setTags(memory.tags.join(', '));
    setSource(memory.source ?? '');
  }, [memory]);

  if (!memory) return <NotFound />;

  const save = async () => {
    await onUpdateMemory(id, {
      title,
      type,
      content,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      source: source || null,
    });
  };

  const available = entities.filter((e) => !memory.entityIds.includes(e.id));

  return (
    <section className="inspector">
      <div className="inspector-head memory-head" style={{ '--accent': colorFor('memory', memory.type) } as CSSProperties}>
        <div className="inspector-kicker">MEMORY</div>
        <h2>{memory.title}</h2>
        <span className="type-pill" style={{ background: colorFor('memory', memory.type) }}>{pretty(memory.type)}</span>
      </div>

      <div className="inspector-body">
        {memory.replaced_by && (
          <div className="replaced-banner">
            <Replace size={15} /> This memory was replaced by a merged version.
          </div>
        )}
        <div className="form-grid">
          <label className="full">Title
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label>Type
            <select value={type} onChange={(e) => setType(e.target.value as MemoryType)}>
              {MEMORY_TYPES.map((t) => <option key={t} value={t}>{pretty(t)}</option>)}
            </select>
          </label>
          <label>Source
            <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="optional" />
          </label>
          <label className="full">Content
            <textarea rows={6} value={content} onChange={(e) => setContent(e.target.value)} />
          </label>
          <label className="full">Tags <span className="hint-inline">comma separated</span>
            <input value={tags} onChange={(e) => setTags(e.target.value)} />
          </label>
        </div>
        <div className="action-row">
          <button className="btn primary" onClick={save}><Save size={15} /> Save changes</button>
          <button className="btn ghost danger" onClick={() => onDelete('memory', id)}><Trash2 size={15} /> Delete</button>
        </div>

        <div className="divider" />
        <SectionTitle icon={<Link2 size={15} />}>Linked entities ({memory.entityIds.length})</SectionTitle>
        <div className="chip-list">
          {memory.entityIds.map((eid) => {
            const e = entities.find((x) => x.id === eid);
            if (!e) return null;
            return (
              <span key={eid} className="chip" style={{ '--chip': colorFor('entity', e.type) } as CSSProperties}>
                <button className="chip-name" onClick={() => onSelect({ kind: 'entity', id: eid })}>{e.name}</button>
                <button className="chip-x" title="Unlink" onClick={() => onUnlinkEntity(id, eid)}><Unlink size={12} /></button>
              </span>
            );
          })}
          {!memory.entityIds.length && <div className="muted">Not linked to any entity.</div>}
        </div>
        <div className="link-row">
          <select value={linkId} onChange={(e) => setLinkId(e.target.value)}>
            <option value="">Choose an entity...</option>
            {available.map((e) => <option key={e.id} value={e.id}>{e.name} · {pretty(e.type)}</option>)}
          </select>
          <button
            className="btn secondary"
            disabled={!linkId}
            onClick={async () => { if (linkId) { await onLinkEntity(id, linkId); setLinkId(''); } }}
          >
            <Link2 size={14} /> Link
          </button>
        </div>

        <div className="divider" />
        <SectionTitle icon={<FileText size={15} />}>Related memories ({intelligence?.related.length ?? 0})</SectionTitle>
        <div className="mini-list">
          {(intelligence?.related ?? []).map((r) => (
            <div key={r.memory.id} className="related-row">
              <button className="mini-link" onClick={() => onSelect({ kind: 'memory', id: r.memory.id })}>
                <span className="item-dot" style={{ background: colorFor('memory', r.memory.type) }} />
                <span className="mini-name">{r.memory.title}</span>
                <span className="score-mini">{Math.round(r.score * 100)}%</span>
              </button>
              <button
                className="icon-btn tiny"
                title={r.linked ? 'Unlink memories' : 'Link memories'}
                onClick={() => (r.linked ? onUnlinkMemory(id, r.memory.id) : onLinkMemory(id, r.memory.id))}
              >
                {r.linked ? <Unlink size={13} /> : <Link2 size={13} />}
              </button>
            </div>
          ))}
          {!intelligence?.related.length && <div className="muted">No related memories detected yet.</div>}
        </div>

        {!!intelligence?.entities.length && (
          <>
            <div className="divider" />
            <SectionTitle icon={<Sparkles size={15} />}>Suggested entities</SectionTitle>
            <div className="mini-list">
              {intelligence.entities.map((s) => (
                <div key={s.entity.id} className="related-row">
                  <button className="mini-link" onClick={() => onSelect({ kind: 'entity', id: s.entity.id })}>
                    <span className="item-dot" style={{ background: colorFor('entity', s.entity.type) }} />
                    <span className="mini-name">{s.entity.name}</span>
                    <span className="reason-mini">{s.reason}</span>
                  </button>
                  <button className="icon-btn tiny" title="Link entity" onClick={() => void onLinkEntity(id, s.entity.id)}>
                    <Plus size={13} />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="divider" />
        <SectionTitle icon={<History size={15} />}>History</SectionTitle>
        <HistoryList entries={history.slice(0, 6)} />
      </div>
    </section>
  );
}

function HistoryList({ entries }: { entries: HistoryEntry[] }) {
  if (!entries.length) return <div className="muted">No history recorded yet.</div>;
  return (
    <div className="history-mini">
      {entries.map((e) => (
        <div key={e.id} className="history-mini-row">
          <span className={`history-dot ${e.action}`} />
          <span className="history-action">{pretty(e.action)}</span>
          <span className="history-date">{new Date(e.created_at).toLocaleString(undefined, {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
          })}</span>
          {e.note && <span className="history-note">{e.note}</span>}
        </div>
      ))}
    </div>
  );
}

function RelationshipInspector({
  id, relationships, entities, onSelect, onUpdateRelationship, onDelete,
}: Props & { id: string }) {
  const rel = relationships.find((r) => r.id === id);
  const [type, setType] = useState('');
  const [description, setDescription] = useState('');
  const [weight, setWeight] = useState(1);

  useEffect(() => {
    if (!rel) return;
    setType(rel.type);
    setDescription(rel.description);
    setWeight(rel.weight);
  }, [rel]);

  if (!rel) return <NotFound />;
  const source = entities.find((e) => e.id === rel.source_id);
  const target = entities.find((e) => e.id === rel.target_id);

  return (
    <section className="inspector">
      <div className="inspector-head rel-head">
        <div className="inspector-kicker">RELATIONSHIP</div>
        <h2>{type || 'Untitled link'}</h2>
      </div>
      <div className="inspector-body">
        <div className="rel-endpoints">
          <button className="endpoint" onClick={() => source && onSelect({ kind: 'entity', id: source.id })}>
            <CircleDot size={14} /> {source?.name ?? 'Unknown'}
          </button>
          <ArrowRight size={16} className="endpoint-arrow" />
          <button className="endpoint" onClick={() => target && onSelect({ kind: 'entity', id: target.id })}>
            <CircleDot size={14} /> {target?.name ?? 'Unknown'}
          </button>
        </div>
        <div className="form-grid">
          <label className="full">Relationship type
            <input value={type} onChange={(e) => setType(e.target.value)} placeholder="e.g. uses, owns, decided" />
          </label>
          <label className="full">Description
            <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <label className="full">Weight
            <input type="number" min={0} max={10} step={0.5} value={weight} onChange={(e) => setWeight(Number(e.target.value))} />
          </label>
        </div>
        <div className="action-row">
          <button className="btn primary" onClick={() => onUpdateRelationship(id, { type, description, weight })}>
            <Save size={15} /> Save changes
          </button>
          <button className="btn ghost danger" onClick={() => onDelete('relationship', id)}>
            <Trash2 size={15} /> Delete
          </button>
        </div>
      </div>
    </section>
  );
}

function NotFound() {
  return (
    <section className="inspector">
      <div className="inspector-head"><h2>Not found</h2></div>
      <div className="inspector-body"><div className="muted">This item no longer exists.</div></div>
    </section>
  );
}

// Re-export so App can reuse the Selection type from one place.
export type { Selection };

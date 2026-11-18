import { useState, type FormEvent, type ReactNode } from 'react';
import { X, FileText, CircleDot, Network } from 'lucide-react';
import type { Entity, EntityType, Memory, MemoryType, Relationship } from '../../shared/types';
import { ENTITY_TYPES, MEMORY_TYPES, pretty } from '../ui';

export type ModalMode = 'memory' | 'entity' | 'relationship' | null;

interface Props {
  mode: ModalMode;
  entities: Entity[];
  defaultSourceId?: string;
  onClose: () => void;
  onCreateMemory: (data: Partial<Memory>) => Promise<void>;
  onCreateEntity: (data: Partial<Entity>) => Promise<void>;
  onCreateRelationship: (data: Partial<Relationship>) => Promise<void>;
}

const TITLES: Record<Exclude<ModalMode, null>, { title: string; sub: string; icon: ReactNode }> = {
  memory: { title: 'New memory', sub: 'Store a conversation, decision, context, mistake or lesson.', icon: <FileText size={18} /> },
  entity: { title: 'New entity', sub: 'Add a node to the knowledge graph.', icon: <CircleDot size={18} /> },
  relationship: { title: 'New relationship', sub: 'Connect two entities with a typed link.', icon: <Network size={18} /> },
};

export default function Modal({
  mode, entities, defaultSourceId, onClose, onCreateMemory, onCreateEntity, onCreateRelationship,
}: Props) {
  if (!mode) return null;

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-icon">{TITLES[mode].icon}</div>
          <div>
            <h2>{TITLES[mode].title}</h2>
            <p>{TITLES[mode].sub}</p>
          </div>
          <button className="icon-btn" onClick={onClose} title="Close"><X size={18} /></button>
        </div>
        {mode === 'memory' && <MemoryForm onCreate={onCreateMemory} onDone={onClose} entities={entities} />}
        {mode === 'entity' && <EntityForm onCreate={onCreateEntity} onDone={onClose} />}
        {mode === 'relationship' && (
          <RelationshipForm
            onCreate={onCreateRelationship}
            onDone={onClose}
            entities={entities}
            defaultSourceId={defaultSourceId}
          />
        )}
      </div>
    </div>
  );
}

function MemoryForm({
  onCreate, onDone, entities,
}: {
  onCreate: (d: Partial<Memory>) => Promise<void>;
  onDone: () => void;
  entities: Entity[];
}) {
  const [type, setType] = useState<MemoryType>('note');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const [source, setSource] = useState('');
  const [entityIds, setEntityIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      await onCreate({
        type,
        title: title.trim(),
        content,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        source: source || null,
        entityIds,
      });
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="modal-form">
      <label>Title
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What should you remember?" required />
      </label>
      <div className="two-col">
        <label>Type
          <select value={type} onChange={(e) => setType(e.target.value as MemoryType)}>
            {MEMORY_TYPES.map((t) => <option key={t} value={t}>{pretty(t)}</option>)}
          </select>
        </label>
        <label>Source
          <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="optional" />
        </label>
      </div>
      <label>Content
        <textarea rows={5} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Write the details..." />
      </label>
      <label>Tags <span className="hint-inline">comma separated</span>
        <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="e.g. architecture, lesson" />
      </label>
      <fieldset className="link-fieldset">
        <legend>Link to entities</legend>
        <div className="check-grid">
          {entities.map((e) => (
            <label key={e.id} className="check-item">
              <input
                type="checkbox"
                checked={entityIds.includes(e.id)}
                onChange={(ev) => setEntityIds((prev) =>
                  ev.target.checked ? [...prev, e.id] : prev.filter((id) => id !== e.id))}
              />
              <span>{e.name}</span>
            </label>
          ))}
          {!entities.length && <span className="muted">Add an entity first to link it here.</span>}
        </div>
      </fieldset>
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={onDone}>Cancel</button>
        <button type="submit" className="btn primary" disabled={busy || !title.trim()}>
          {busy ? 'Saving...' : 'Save memory'}
        </button>
      </div>
    </form>
  );
}

function EntityForm({
  onCreate, onDone,
}: {
  onCreate: (d: Partial<Entity>) => Promise<void>;
  onDone: () => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<EntityType>('concept');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onCreate({ name: name.trim(), type, description });
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="modal-form">
      <label>Name
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. FalkorDB" required />
      </label>
      <label>Type
        <select value={type} onChange={(e) => setType(e.target.value as EntityType)}>
          {ENTITY_TYPES.map((t) => <option key={t} value={t}>{pretty(t)}</option>)}
        </select>
      </label>
      <label>Description
        <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="A short note about this entity..." />
      </label>
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={onDone}>Cancel</button>
        <button type="submit" className="btn primary" disabled={busy || !name.trim()}>
          {busy ? 'Saving...' : 'Add entity'}
        </button>
      </div>
    </form>
  );
}

function RelationshipForm({
  onCreate, onDone, entities, defaultSourceId,
}: {
  onCreate: (d: Partial<Relationship>) => Promise<void>;
  onDone: () => void;
  entities: Entity[];
  defaultSourceId?: string;
}) {
  const [source, setSource] = useState(defaultSourceId ?? '');
  const [target, setTarget] = useState('');
  const [type, setType] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!source || !target || source === target || !type.trim()) return;
    setBusy(true);
    try {
      await onCreate({
        source_id: source,
        target_id: target,
        type: type.trim(),
        description,
        weight: 1,
      });
      onDone();
    } finally {
      setBusy(false);
    }
  };

  const options = entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>);

  return (
    <form onSubmit={submit} className="modal-form">
      <div className="two-col">
        <label>From
          <select value={source} onChange={(e) => setSource(e.target.value)} required>
            <option value="">Choose...</option>
            {options}
          </select>
        </label>
        <label>To
          <select value={target} onChange={(e) => setTarget(e.target.value)} required>
            <option value="">Choose...</option>
            {options}
          </select>
        </label>
      </div>
      <label>Relationship type
        <input value={type} onChange={(e) => setType(e.target.value)} placeholder="e.g. uses, owns, decided" required />
      </label>
      <label>Description
        <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="optional" />
      </label>
      {entities.length < 2 && <div className="muted">You need at least two entities to create a relationship.</div>}
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={onDone}>Cancel</button>
        <button type="submit" className="btn primary" disabled={busy || !source || !target || source === target || !type.trim()}>
          {busy ? 'Saving...' : 'Create relationship'}
        </button>
      </div>
    </form>
  );
}

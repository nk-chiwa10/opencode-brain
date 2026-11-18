import { useMemo, useState } from 'react';
import { Search, Plus, Brain, Trash2, FileText, CircleDot, X } from 'lucide-react';
import type { Entity, Memory } from '../../shared/types';
import { colorFor, pretty } from '../ui';

export type Selection = { kind: 'entity' | 'memory' | 'relationship'; id: string } | null;

interface Props {
  memories: Memory[];
  entities: Entity[];
  query: string;
  setQuery: (q: string) => void;
  selection: Selection;
  onSelect: (s: Selection) => void;
  onAdd: (kind: 'memory' | 'entity') => void;
  onDelete: (kind: 'memory' | 'entity', id: string) => void;
}

export default function Sidebar({
  memories, entities, query, setQuery, selection, onSelect, onAdd, onDelete,
}: Props) {
  const [tab, setTab] = useState<'memories' | 'entities'>('memories');
  const q = query.trim().toLowerCase();

  const filteredMemories = useMemo(
    () => memories.filter((m) =>
      !q || `${m.title} ${m.content} ${m.tags.join(' ')}`.toLowerCase().includes(q)),
    [memories, q],
  );
  const filteredEntities = useMemo(
    () => entities.filter((e) =>
      !q || `${e.name} ${e.description} ${e.type}`.toLowerCase().includes(q)),
    [entities, q],
  );

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark"><Brain size={20} /></div>
        <div>
          <div className="brand-name">OpenCode Brain</div>
          <div className="brand-tagline">Memory · Graph · Vision</div>
        </div>
      </div>

      <div className="search-box">
        <Search size={15} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search everything..."
          aria-label="Search"
        />
        {query && <button className="icon-btn tiny" onClick={() => setQuery('')} title="Clear"><X size={13} /></button>}
      </div>

      <div className="tabs">
        <button
          className={tab === 'memories' ? 'active' : ''}
          onClick={() => setTab('memories')}
        >
          <FileText size={14} /> Memories <span className="count">{memories.length}</span>
        </button>
        <button
          className={tab === 'entities' ? 'active' : ''}
          onClick={() => setTab('entities')}
        >
          <CircleDot size={14} /> Entities <span className="count">{entities.length}</span>
        </button>
      </div>

      <div className="list-head">
        <span>{tab === 'memories' ? 'Stored memories' : 'Knowledge nodes'}</span>
        <button
          className="add-btn"
          onClick={() => onAdd(tab === 'memories' ? 'memory' : 'entity')}
          title={`New ${tab === 'memories' ? 'memory' : 'entity'}`}
        >
          <Plus size={14} /> Add
        </button>
      </div>

      <div className="item-list">
        {tab === 'memories' &&
          (filteredMemories.length ? filteredMemories.map((m) => {
            const selected = selection?.kind === 'memory' && selection.id === m.id;
            return (
              <div
                key={m.id}
                className={`list-item${selected ? ' selected' : ''}`}
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                onClick={() => onSelect({ kind: 'memory', id: m.id })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect({ kind: 'memory', id: m.id });
                  }
                }}
              >
                <span className="item-dot" style={{ background: colorFor('memory', m.type) }} />
                <span className="item-body">
                  <span className="item-title">{m.title}</span>
                  <span className="item-sub">{pretty(m.type)} · {m.entityIds.length} linked</span>
                </span>
                <button
                  className="icon-btn tiny delete"
                  title="Delete memory"
                  onClick={(e) => { e.stopPropagation(); onDelete('memory', m.id); }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          }) : <Empty label={q ? 'No matching memories' : 'No memories yet'} />)}

        {tab === 'entities' &&
          (filteredEntities.length ? filteredEntities.map((e) => {
            const selected = selection?.kind === 'entity' && selection.id === e.id;
            return (
              <div
                key={e.id}
                className={`list-item${selected ? ' selected' : ''}`}
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                onClick={() => onSelect({ kind: 'entity', id: e.id })}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault();
                    onSelect({ kind: 'entity', id: e.id });
                  }
                }}
              >
                <span className="item-dot" style={{ background: colorFor('entity', e.type) }} />
                <span className="item-body">
                  <span className="item-title">{e.name}</span>
                  <span className="item-sub">{pretty(e.type)}</span>
                </span>
                <button
                  className="icon-btn tiny delete"
                  title="Delete entity"
                  onClick={(ev) => { ev.stopPropagation(); onDelete('entity', e.id); }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          }) : <Empty label={q ? 'No matching entities' : 'No entities yet'} />)}
      </div>

      <div className="sidebar-foot">All data stays on this machine.</div>
    </aside>
  );
}

function Empty({ label }: { label: string }) {
  return <div className="empty-state">{label}</div>;
}

import { useMemo, useState, type ReactNode } from 'react';
import { Plus, Pencil, Replace, Trash2, Clock3, Filter, Brain } from 'lucide-react';
import type { HistoryEntry } from '../../shared/types';
import { pretty } from '../ui';

interface Props {
  entries: HistoryEntry[];
  loading: boolean;
  onSelect: (type: 'memory' | 'entity', id: string) => void;
}

const ACTIONS = ['all', 'created', 'updated', 'replaced', 'deleted'] as const;

const ACTION_META: Record<string, { icon: ReactNode; color: string; label: string }> = {
  created: { icon: <Plus size={14} />, color: '#2dd4a7', label: 'Created' },
  updated: { icon: <Pencil size={13} />, color: '#4f8cff', label: 'Updated' },
  replaced: { icon: <Replace size={14} />, color: '#f5a524', label: 'Replaced' },
  deleted: { icon: <Trash2 size={13} />, color: '#f2637f', label: 'Deleted' },
};

export default function Timeline({ entries, loading, onSelect }: Props) {
  const [subject, setSubject] = useState<'all' | 'memory' | 'entity'>('all');
  const [action, setAction] = useState<(typeof ACTIONS)[number]>('all');

  const filtered = useMemo(
    () => entries.filter((e) =>
      (subject === 'all' || e.subject_type === subject) &&
      (action === 'all' || e.action === action)),
    [entries, subject, action],
  );

  const groups = useMemo(() => {
    const map = new Map<string, HistoryEntry[]>();
    for (const e of filtered) {
      const day = new Date(e.created_at).toLocaleDateString(undefined, {
        year: 'numeric', month: 'long', day: 'numeric',
      });
      map.set(day, [...(map.get(day) ?? []), e]);
    }
    return [...map.entries()];
  }, [filtered]);

  if (loading) return <div className="view-loading"><div className="spinner" /> Loading timeline...</div>;

  return (
    <div className="view-panel">
      <div className="view-header">
        <div>
          <div className="view-kicker">MEMORY TIMELINE</div>
          <h1>How your brain evolved</h1>
          <p>Every creation, edit, merge and deletion — in order.</p>
        </div>
        <div className="view-filters">
          <span className="filter-label"><Filter size={13} /></span>
          <select value={subject} onChange={(e) => setSubject(e.target.value as typeof subject)}>
            <option value="all">All subjects</option>
            <option value="memory">Memories</option>
            <option value="entity">Entities</option>
          </select>
          <select value={action} onChange={(e) => setAction(e.target.value as typeof action)}>
            {ACTIONS.map((a) => <option key={a} value={a}>{a === 'all' ? 'All actions' : pretty(a)}</option>)}
          </select>
        </div>
      </div>

      <div className="timeline-scroll">
        {groups.length ? groups.map(([day, items]) => (
          <section key={day} className="timeline-group">
            <div className="timeline-day"><Clock3 size={13} /> {day}</div>
            <div className="timeline-list">
              {items.map((e) => {
                const meta = ACTION_META[e.action] ?? ACTION_META.updated;
                return (
                  <button
                    key={e.id}
                    className="timeline-entry"
                    onClick={() => onSelect(e.subject_type as 'memory' | 'entity', e.subject_id)}
                  >
                    <span className="timeline-icon" style={{ color: meta.color, background: `${meta.color}1e` }}>
                      {meta.icon}
                    </span>
                    <span className="timeline-content">
                      <span className="timeline-line">
                        <strong>{e.subject_name}</strong>
                        <span className="action-tag" style={{ color: meta.color }}>{meta.label}</span>
                        <span className="subject-tag">{e.subject_type}</span>
                      </span>
                      {e.note && <span className="timeline-note">{e.note}</span>}
                    </span>
                    <time>{new Date(e.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</time>
                  </button>
                );
              })}
            </div>
          </section>
        )) : (
          <div className="view-empty"><Brain size={26} /> No history matches these filters.</div>
        )}
      </div>
    </div>
  );
}

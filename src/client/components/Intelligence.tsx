import { CopyCheck, Link2, Unlink, GitMerge, Sparkles, FileText } from 'lucide-react';
import type { IntelligenceReport } from '../../shared/types';
import { colorFor, pretty } from '../ui';

interface Props {
  report: IntelligenceReport | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onMerge: (targetId: string, sourceId: string) => void;
  onLink: (a: string, b: string) => void;
  onUnlink: (a: string, b: string) => void;
}

function scorePercent(score: number): string {
  return `${Math.round(score * 100)}%`;
}

export default function Intelligence({
  report, loading, onSelect, onMerge, onLink, onUnlink,
}: Props) {
  if (loading || !report) {
    return <div className="view-loading"><div className="spinner" /> Analyzing memories...</div>;
  }

  const { duplicates, connections, stats } = report;

  return (
    <div className="view-panel">
      <div className="view-header">
        <div>
          <div className="view-kicker">MEMORY INTELLIGENCE</div>
          <h1>Find what connects</h1>
          <p>Duplicate detection and related-information suggestions, computed locally.</p>
        </div>
        <div className="intel-stats">
          <div><strong>{stats.analyzed}</strong><span>analyzed</span></div>
          <div><strong>{stats.duplicateGroups}</strong><span>duplicate groups</span></div>
          <div><strong>{stats.suggestions}</strong><span>suggestions</span></div>
        </div>
      </div>

      <div className="intel-scroll">
        <section className="intel-section">
          <h2><CopyCheck size={16} /> Possible duplicates</h2>
          <p className="section-desc">Memories that say nearly the same thing. Merge them to keep one source of truth.</p>
          {duplicates.length ? (
            <div className="duplicate-list">
              {duplicates.map((cluster) => (
                <div key={cluster.id} className="duplicate-card">
                  <div className="cluster-head">
                    <span>{cluster.memories.length} similar memories</span>
                    <span className="score-badge">{scorePercent(cluster.score)} match</span>
                  </div>
                  {cluster.memories.map((m, index) => (
                    <div key={m.id} className="duplicate-memory">
                      <span className="item-dot" style={{ background: colorFor('memory', m.type) }} />
                      <button className="dup-title" onClick={() => onSelect(m.id)}>{m.title}</button>
                      <span className="dup-type">{pretty(m.type)}</span>
                      <span className="dup-date">{new Date(m.updated_at).toLocaleDateString()}</span>
                      {index > 0 && (
                        <button
                          className="mini-action"
                          title={`Merge into "${cluster.memories[0].title}"`}
                          onClick={() => onMerge(cluster.memories[0].id, m.id)}
                        >
                          <GitMerge size={13} /> Merge
                        </button>
                      )}
                      {index === 0 && <span className="primary-tag">primary</span>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : <div className="intel-empty"><Sparkles size={20} /> No obvious duplicates found. Your memories look distinct.</div>}
        </section>

        <section className="intel-section">
          <h2><Link2 size={16} /> Related memories</h2>
          <p className="section-desc">Connected ideas that aren't explicitly linked yet. Link them to strengthen the graph.</p>
          {connections.length ? (
            <div className="connection-list">
              {connections.map(({ a, b, score, linked }) => (
                <div key={`${a.id}-${b.id}`} className="connection-row">
                  <div className="connection-pair">
                    <button className="dup-title" onClick={() => onSelect(a.id)}>{a.title}</button>
                    <span className="pair-arrow">↔</span>
                    <button className="dup-title" onClick={() => onSelect(b.id)}>{b.title}</button>
                  </div>
                  <div className="score-track" title={`${scorePercent(score)} similarity`}>
                    <span style={{ width: scorePercent(score) }} />
                  </div>
                  <span className="score-label">{scorePercent(score)}</span>
                  {linked ? (
                    <button className="mini-action linked" onClick={() => onUnlink(a.id, b.id)}>
                      <Unlink size={13} /> Linked
                    </button>
                  ) : (
                    <button className="mini-action" onClick={() => onLink(a.id, b.id)}>
                      <Link2 size={13} /> Link
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : <div className="intel-empty"><FileText size={20} /> Not enough related content yet. Add more memories to see suggestions.</div>}
        </section>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Download, Upload, Network, Link2, Database, Clock3, Sparkles } from 'lucide-react';
import type {
  BackupData, Entity, EntityContext, GraphData, HistoryEntry, IntelligenceReport, Memory,
  MemoryIntelligence, Relationship,
} from '../shared/types';
import { api } from './api';
import Sidebar, { type Selection } from './components/Sidebar';
import GraphView from './components/GraphView';
import Timeline from './components/Timeline';
import Intelligence from './components/Intelligence';
import Inspector from './components/Inspector';
import Modal, { type ModalMode } from './components/Modal';

type View = 'graph' | 'timeline' | 'intelligence';

export default function App() {
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [context, setContext] = useState<EntityContext | null>(null);
  const [memoryIntel, setMemoryIntel] = useState<MemoryIntelligence | null>(null);
  const [subjectHistory, setSubjectHistory] = useState<HistoryEntry[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const [view, setView] = useState<View>('graph');
  const [timeline, setTimeline] = useState<HistoryEntry[]>([]);
  const [intelligence, setIntelligence] = useState<IntelligenceReport | null>(null);
  const [modal, setModal] = useState<ModalMode>(null);
  const [defaultSourceId, setDefaultSourceId] = useState<string | undefined>();
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fileInput = useRef<HTMLInputElement>(null);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2600);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [g, m, e, r, s, t, intel] = await Promise.all([
        api.graph(), api.memories(), api.entities(), api.relationships(), api.stats(),
        api.timeline(), api.intelligence(),
      ]);
      setGraph(g);
      setMemories(m);
      setEntities(e);
      setRelationships(r);
      setStats(s);
      setTimeline(t);
      setIntelligence(intel);
    } catch (err) {
      notify(`Failed to load brain: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!selection) {
      setContext(null);
      setMemoryIntel(null);
      setSubjectHistory([]);
      return;
    }
    if (selection.kind === 'entity') {
      void api.entityContext(selection.id).then(setContext).catch(() => setContext(null));
      void api.subjectHistory('entity', selection.id).then(setSubjectHistory).catch(() => setSubjectHistory([]));
      setMemoryIntel(null);
    } else if (selection.kind === 'memory') {
      void api.memoryIntelligence(selection.id).then(setMemoryIntel).catch(() => setMemoryIntel(null));
      void api.subjectHistory('memory', selection.id).then(setSubjectHistory).catch(() => setSubjectHistory([]));
      setContext(null);
    } else {
      void api.subjectHistory('relationship', selection.id).then(setSubjectHistory).catch(() => setSubjectHistory([]));
      setContext(null);
      setMemoryIntel(null);
    }
  }, [selection, memories, entities]);

  const openNewRelationship = (sourceId?: string) => {
    setDefaultSourceId(sourceId);
    setModal('relationship');
  };

  const handleDelete = async (kind: 'memory' | 'entity' | 'relationship', id: string) => {
    if (!window.confirm(`Delete this ${kind}? This cannot be undone.`)) return;
    await (kind === 'memory'
      ? api.deleteMemory(id)
      : kind === 'entity'
        ? api.deleteEntity(id)
        : api.deleteRelationship(id));
    if (selection?.id === id) setSelection(null);
    notify(`${kind[0].toUpperCase() + kind.slice(1)} deleted`);
    await refresh();
  };

  const linkEntity = async (memoryId: string, entityId: string) => {
    const m = memories.find((x) => x.id === memoryId);
    if (!m || m.entityIds.includes(entityId)) return;
    await api.updateMemory(memoryId, { entityIds: [...m.entityIds, entityId] });
    notify('Entity linked');
    await refresh();
  };

  const unlinkEntity = async (memoryId: string, entityId: string) => {
    const m = memories.find((x) => x.id === memoryId);
    if (!m) return;
    await api.updateMemory(memoryId, { entityIds: m.entityIds.filter((id) => id !== entityId) });
    notify('Entity unlinked');
    await refresh();
  };

  const mergeMemories = async (targetId: string, sourceId: string) => {
    if (!window.confirm('Merge these memories? The secondary one will be marked as replaced.')) return;
    const merged = await api.mergeMemories(targetId, sourceId);
    notify('Memories merged');
    await refresh();
    setSelection({ kind: 'memory', id: merged.id });
  };

  const linkMemories = async (a: string, b: string) => {
    await api.linkMemories(a, b);
    notify('Memories linked');
    await refresh();
  };

  const unlinkMemories = async (a: string, b: string) => {
    await api.unlinkMemories(a, b);
    notify('Link removed');
    await refresh();
  };

  const exportBackup = async () => {
    const data = await api.exportBackup();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `opencode-brain-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify('Backup exported');
  };

  const importBackup = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as BackupData;
      const result = await api.importBackup(data);
      notify(`Imported ${result.entities} entities, ${result.memories} memories, ${result.relationships} relationships`);
      setSelection(null);
      await refresh();
    } catch (err) {
      notify(`Import failed: ${(err as Error).message}`);
    }
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <header className="topbar">
        <div className="topbar-left">
          <span className="topbar-logo"><Database size={16} /></span>
          <span className="topbar-title">OpenCode Brain</span>
          <span className="topbar-divider" />
          <div className="view-switch">
            <button className={view === 'graph' ? 'active' : ''} onClick={() => setView('graph')}><Network size={14} /> Graph</button>
            <button className={view === 'timeline' ? 'active' : ''} onClick={() => setView('timeline')}><Clock3 size={14} /> Timeline</button>
            <button className={view === 'intelligence' ? 'active' : ''} onClick={() => setView('intelligence')}><Sparkles size={14} /> Intelligence</button>
          </div>
        </div>
        <div className="topbar-actions">
          <button className="btn ghost" onClick={exportBackup}><Download size={15} /> Export</button>
          <button className="btn ghost" onClick={() => fileInput.current?.click()}><Upload size={15} /> Import</button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importBackup(file);
              e.target.value = '';
            }}
          />
          <span className="topbar-divider" />
          <button className="btn secondary" onClick={() => openNewRelationship()}><Link2 size={15} /> Relationship</button>
          <button className="btn secondary" onClick={() => setModal('entity')}><Network size={15} /> Entity</button>
          <button className="btn primary" onClick={() => setModal('memory')}><Plus size={15} /> Memory</button>
        </div>
      </header>

      <div className="workspace">
        <Sidebar
          memories={memories}
          entities={entities}
          query={query}
          setQuery={setQuery}
          selection={selection}
          onSelect={setSelection}
          onAdd={(kind) => setModal(kind)}
          onDelete={(kind, id) => void handleDelete(kind, id)}
        />

        <main className="canvas" id="main-content">
          {loading ? (
            <div className="loading"><div className="spinner" /> Loading your brain...</div>
          ) : view === 'graph' ? (
            <GraphView graph={graph} selection={selection} onSelect={setSelection} />
          ) : view === 'timeline' ? (
            <Timeline
              entries={timeline}
              loading={false}
              onSelect={(type, id) => {
                setSelection({ kind: type, id });
                setView('graph');
              }}
            />
          ) : (
            <Intelligence
              report={intelligence}
              loading={false}
              onSelect={(id) => {
                setSelection({ kind: 'memory', id });
                setView('graph');
              }}
              onMerge={(target, source) => void mergeMemories(target, source)}
              onLink={(a, b) => void linkMemories(a, b)}
              onUnlink={(a, b) => void unlinkMemories(a, b)}
            />
          )}
        </main>

        <Inspector
          selection={selection}
          entities={entities}
          memories={memories}
          relationships={relationships}
          context={context}
          intelligence={memoryIntel}
          history={subjectHistory}
          stats={stats}
          onSelect={setSelection}
          onLinkMemory={(id, otherId) => void linkMemories(id, otherId)}
          onUnlinkMemory={(id, otherId) => void unlinkMemories(id, otherId)}
          onUpdateEntity={async (id, data) => { await api.updateEntity(id, data); notify('Entity saved'); await refresh(); }}
          onUpdateMemory={async (id, data) => { await api.updateMemory(id, data); notify('Memory saved'); await refresh(); }}
          onUpdateRelationship={async (id, data) => { await api.updateRelationship(id, data); notify('Relationship saved'); await refresh(); }}
          onDelete={(kind, id) => void handleDelete(kind, id)}
          onLinkEntity={linkEntity}
          onUnlinkEntity={unlinkEntity}
          onNewRelationship={openNewRelationship}
        />
      </div>

      <Modal
        mode={modal}
        entities={entities}
        defaultSourceId={defaultSourceId}
        onClose={() => setModal(null)}
        onCreateMemory={async (data) => {
          const created = await api.createMemory(data);
          notify('Memory created');
          await refresh();
          setSelection({ kind: 'memory', id: created.id });
        }}
        onCreateEntity={async (data) => {
          const created = await api.createEntity(data);
          notify('Entity created');
          await refresh();
          setSelection({ kind: 'entity', id: created.id });
        }}
        onCreateRelationship={async (data) => {
          const created = await api.createRelationship(data);
          notify('Relationship created');
          await refresh();
          setSelection({ kind: 'relationship', id: created.id });
        }}
      />

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

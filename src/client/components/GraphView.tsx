import { useCallback, useEffect, useMemo, useRef, type CSSProperties } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  Handle,
  Position,
  MarkerType,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
} from '@xyflow/react';
import {
  User, FolderKanban, Code2, Lightbulb, GitCommitHorizontal, Building2, MapPin, CalendarDays,
  Network, FileText, type LucideIcon,
} from 'lucide-react';
import type { EntityType, GraphData, GraphNode } from '../../shared/types';
import { colorFor, ENTITY_COLORS, pretty } from '../ui';

type Selection = { kind: 'entity' | 'memory' | 'relationship'; id: string } | null;

type EntityNodeData = {
  entity: GraphNode;
  connections: number;
  active: boolean;
  neighbor: boolean;
  onSelect: (id: string) => void;
} & Record<string, unknown>;

type EntityFlowNode = Node<EntityNodeData, 'entity'>;

const ICONS: Record<EntityType, LucideIcon> = {
  person: User,
  project: FolderKanban,
  technology: Code2,
  concept: Lightbulb,
  decision: GitCommitHorizontal,
  organization: Building2,
  location: MapPin,
  event: CalendarDays,
};

function EntityNode({ data }: NodeProps<EntityFlowNode>) {
  const { entity, connections, active, neighbor, onSelect } = data;
  const color = colorFor('entity', entity.type);
  const Icon = ICONS[entity.type as EntityType] ?? Network;
  return (
    <div
      className={`brain-node${active ? ' active' : ''}${neighbor ? ' neighbor' : ''}`}
      style={{ '--node-color': color } as CSSProperties}
      role="button"
      tabIndex={0}
      aria-label={`Inspect ${entity.name}`}
      aria-pressed={active}
      onClick={() => onSelect(entity.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(entity.id);
        }
      }}
      title={entity.description || entity.name}
    >
      <Handle type="target" position={Position.Left} className="node-handle" />
      <span className="node-icon"><Icon size={16} strokeWidth={2.2} /></span>
      <span className="node-copy">
        <span className="node-name">{entity.name}</span>
        <span className="node-meta">{pretty(entity.type)} · {connections} link{connections === 1 ? '' : 's'}</span>
      </span>
      <Handle type="source" position={Position.Right} className="node-handle" />
    </div>
  );
}

const nodeTypes = { entity: EntityNode };

function layoutGraph(graph: GraphData): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const adj = new Map<string, string[]>();
  graph.nodes.forEach((n) => adj.set(n.id, []));
  graph.edges.forEach((e) => {
    adj.get(e.source)?.push(e.target);
    adj.get(e.target)?.push(e.source);
  });

  const root = [...graph.nodes].sort((a, b) => b.connections - a.connections)[0];
  if (!root) return positions;

  const visited = new Set<string>([root.id]);
  positions.set(root.id, { x: 0, y: 0 });
  let frontier = [root.id];
  let ring = 1;

  while (frontier.length) {
    const children: string[] = [];
    for (const id of frontier) {
      for (const nb of adj.get(id) ?? []) {
        if (!visited.has(nb)) {
          visited.add(nb);
          children.push(nb);
        }
      }
    }
    if (!children.length) break;
    const radius = ring * 250;
    children.forEach((id, i) => {
      const angle = (2 * Math.PI * i) / children.length - Math.PI / 2;
      positions.set(id, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
    });
    frontier = children;
    ring += 1;
  }

  let orphan = 0;
  for (const n of graph.nodes) {
    if (!positions.has(n.id)) {
      const angle = (2 * Math.PI * orphan) / Math.max(graph.nodes.length, 1);
      positions.set(n.id, {
        x: Math.cos(angle) * (ring * 250 + 80),
        y: Math.sin(angle) * (ring * 250 + 80),
      });
      orphan += 1;
    }
  }
  return positions;
}

interface Props {
  graph: GraphData | null;
  selection: Selection;
  onSelect: (selection: Selection) => void;
}

export default function GraphView({ graph, selection, onSelect }: Props) {
  const positions = useRef(new Map<string, { x: number; y: number }>());

  const computed = useMemo(() => {
    if (!graph) return { nodes: [] as EntityFlowNode[], edges: [] as Edge[] };
    const layout = layoutGraph(graph);
    const activeEntityId = selection?.kind === 'entity' ? selection.id : null;
    const neighborIds = new Set<string>();
    if (activeEntityId) {
      for (const e of graph.edges) {
        if (e.source === activeEntityId) neighborIds.add(e.target);
        if (e.target === activeEntityId) neighborIds.add(e.source);
      }
    }

    const nodes: EntityFlowNode[] = graph.nodes.map((entity) => {
      const isActive = activeEntityId === entity.id;
      const isNeighbor = neighborIds.has(entity.id);
      return {
        id: entity.id,
        type: 'entity',
        position: positions.current.get(entity.id) ?? layout.get(entity.id) ?? { x: 0, y: 0 },
        selected: isActive,
        style: { opacity: activeEntityId && !isActive && !isNeighbor ? 0.28 : 1 },
        data: {
          entity,
          connections: entity.connections,
          active: isActive,
          neighbor: isNeighbor,
          onSelect: (id: string) => onSelect({ kind: 'entity', id }),
        },
      };
    });
    const edges: Edge[] = graph.edges.map((e) => {
      const highlighted = activeEntityId === e.source || activeEntityId === e.target;
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label,
        animated: highlighted,
        style: {
          stroke: highlighted ? '#f5a524' : '#4a5570',
          strokeWidth: highlighted ? 2.4 : 1.4,
          opacity: activeEntityId ? (highlighted ? 1 : 0.28) : 0.7,
        },
        labelStyle: { fill: highlighted ? '#f5a524' : '#8b97b0', fontSize: 10, fontWeight: 600 },
        labelBgStyle: { fill: '#141a26', fillOpacity: 0.9 },
        labelBgPadding: [5, 3] as [number, number],
        labelBgBorderRadius: 4,
        markerEnd: { type: MarkerType.ArrowClosed, color: highlighted ? '#f5a524' : '#4a5570', width: 16, height: 16 },
      };
    });
    return { nodes, edges };
  }, [graph, selection, onSelect]);

  const activeEntityId = selection?.kind === 'entity' ? selection.id : null;
  const relatedMemories = useMemo(
    () => (graph && activeEntityId
      ? graph.memories.filter((m) => m.entityIds.includes(activeEntityId)).slice(0, 6)
      : []),
    [graph, activeEntityId],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<EntityFlowNode>(computed.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(computed.edges);

  useEffect(() => {
    setNodes(computed.nodes.map((n) => ({
      ...n,
      position: positions.current.get(n.id) ?? n.position,
    })));
    setEdges(computed.edges);
  }, [computed, setNodes, setEdges]);

  const handleNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      for (const change of changes) {
        if (change.type === 'position' && change.position) {
          positions.current.set(change.id, change.position);
        }
      }
      onNodesChange(changes);
    },
    [onNodesChange],
  );

  return (
    <div className="graph-wrap">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onPaneClick={() => onSelect(null)}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        minZoom={0.15}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#2a3346" />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor={(n) => colorFor('entity', (n.data as EntityNodeData).entity?.type ?? '') || '#4f8cff'}
          maskColor="rgba(9, 12, 20, 0.75)"
          pannable
          zoomable
        />
        <Panel position="top-left" className="graph-legend">
          <div className="legend-title"><Network size={13} /> Visual Brain</div>
          <div className="legend-items">
            {Object.entries(ENTITY_COLORS).map(([type, color]) => (
              <span key={type} className="legend-item">
                <i style={{ background: color }} /> {pretty(type)}
              </span>
            ))}
          </div>
        </Panel>
        {activeEntityId && (
          <Panel position="top-right" className="graph-related">
            <div className="related-title"><FileText size={13} /> Related memories</div>
            {relatedMemories.length ? relatedMemories.map((m) => (
              <button
                key={m.id}
                className="related-memory"
                onClick={() => onSelect({ kind: 'memory', id: m.id })}
              >
                <span className="item-dot" style={{ background: colorFor('memory', m.type) }} />
                <span className="mini-name">{m.title}</span>
              </button>
            )) : <div className="related-empty">No linked memories</div>}
          </Panel>
        )}
        <Panel position="bottom-center" className="graph-hint">
          Click a node to highlight its connections · drag to rearrange · scroll to zoom
        </Panel>
      </ReactFlow>
    </div>
  );
}

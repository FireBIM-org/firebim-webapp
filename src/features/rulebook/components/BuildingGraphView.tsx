import {
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
  Bars3Icon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
  PlayIcon,
} from '@heroicons/react/24/outline';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRuleBookStore } from '../store';
import type {
  BuildingGraphData,
  BuildingGraphTargetClass,
  ExecutionStep,
  NodeEvaluationResult,
} from '../types';
import { ExecutionControls } from './ExecutionControls';

type Props = {
  expanded?: boolean;
  collapsed?: boolean;
  onToggleExpanded?: () => void;
  onToggleCollapsed?: () => void;
  onRun?: () => void;
};

type PositionedNode = BuildingGraphData['nodes'][number] & {
  x: number;
  y: number;
  ring: number;
};

type GraphBounds = {
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  maxRing: number;
};

type PropertyBubble = {
  key: string;
  label: string;
  value: string;
  x: number;
  y: number;
};

type VisualNodeState = 1 | 2 | 3;

type StepDisplay = {
  event_type: string;
  node_id?: string | null;
  node_label?: string | null;
  sample_target_label?: string | null;
  target_class_label?: string | null;
  property_label?: string | null;
  property_path?: string | null;
  operator?: string | null;
  expected_value?: string | null;
  true_path?: string | null;
  false_path?: string | null;
  unknown_path?: string | null;
  branch_taken?: 'True' | 'False' | 'Unknown' | null;
  terminal_label?: string | null;
  terminal_output?: string | null;
  outcome_label?: string | null;
};

const CLASS_RING_INDEX: Record<BuildingGraphTargetClass, number> = {
  Project: 0,
  Site: 1,
  Building: 2,
  Storey: 3,
  Space: 4,
  Room: 5,
  Wall: 6,
  Column: 6,
  Beam: 6,
  Floor: 6,
  Ceiling: 6,
  'Room-Furniture': 7,
};

const CLASS_COLORS: Record<BuildingGraphTargetClass, string> = {
  Project: '#0f766e',
  Site: '#0891b2',
  Building: '#2563eb',
  Storey: '#4f46e5',
  Space: '#7c3aed',
  Room: '#9333ea',
  Wall: '#ea580c',
  Column: '#dc2626',
  Beam: '#b91c1c',
  Floor: '#ca8a04',
  Ceiling: '#65a30d',
  'Room-Furniture': '#0d9488',
};

function getNodeStroke(result: NodeEvaluationResult | undefined, emphasis: VisualNodeState) {
  if (emphasis === 2) return '#0f172a';
  if (result === 'True') return '#166534';
  if (result === 'False') return '#991b1b';
  if (result === 'Unknown') return '#92400e';
  return emphasis === 3 ? '#475569' : '#64748b';
}

function getResultHalo(result: NodeEvaluationResult | undefined, emphasis: VisualNodeState) {
  if (emphasis === 1) return 'rgba(148, 163, 184, 0.04)';
  if (result === 'True') return emphasis === 2 ? 'rgba(22, 101, 52, 0.22)' : 'rgba(22, 101, 52, 0.12)';
  if (result === 'False') return emphasis === 2 ? 'rgba(153, 27, 27, 0.22)' : 'rgba(153, 27, 27, 0.12)';
  if (result === 'Unknown') return emphasis === 2 ? 'rgba(146, 64, 14, 0.22)' : 'rgba(146, 64, 14, 0.12)';
  return emphasis === 2 ? 'rgba(148, 163, 184, 0.16)' : 'rgba(148, 163, 184, 0.08)';
}

function getNodeFill(kind: BuildingGraphTargetClass) {
  return CLASS_COLORS[kind] ?? '#94a3b8';
}

function shortenValue(value: unknown) {
  const text = String(value);
  return text.length > 20 ? `${text.slice(0, 20)}...` : text;
}

function formatPropertyKey(key: string) {
  return key.includes('/') ? key.split('/').filter(Boolean).pop() ?? key : key;
}

function buildPropertyBubbles(node: PositionedNode | null): PropertyBubble[] {
  if (!node?.metadata) {
    return [];
  }

  const entries = Object.entries(node.metadata)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .slice(0, 8);

  if (entries.length === 0) {
    return [];
  }

  const orbitRadius = 82;
  return entries.map(([key, value], index) => {
    const angle = (Math.PI * 2 * index) / entries.length - Math.PI / 2;
    return {
      key,
      label: formatPropertyKey(key),
      value: shortenValue(value),
      x: node.x + Math.cos(angle) * orbitRadius,
      y: node.y + Math.sin(angle) * orbitRadius,
    };
  });
}

function buildGraphLayout(graph: BuildingGraphData | null) {
  if (!graph) {
    return {
      nodes: [] as PositionedNode[],
      bounds: { width: 1200, height: 720, centerX: 600, centerY: 360, maxRing: 0 } as GraphBounds,
    };
  }

  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const groupedByRing = new Map<number, BuildingGraphData['nodes']>();

  for (const node of graph.nodes) {
    const ring = CLASS_RING_INDEX[node.kind] ?? 7;
    const bucket = groupedByRing.get(ring) ?? [];
    bucket.push(node);
    groupedByRing.set(ring, bucket);
  }

  const maxRing = Math.max(...Array.from(groupedByRing.keys()), 0);
  const radiusStep = 118;
  const maxRadius = Math.max(1, maxRing) * radiusStep;
  const padding = 200;
  const centerX = padding + maxRadius;
  const centerY = padding + maxRadius;
  const positioned: PositionedNode[] = [];

  for (const [ring, nodes] of Array.from(groupedByRing.entries()).sort((a, b) => a[0] - b[0])) {
    const ordered = [...nodes].sort((a, b) => {
      const aParent = a.parent_id ? nodesById.get(a.parent_id)?.label ?? a.parent_id : '';
      const bParent = b.parent_id ? nodesById.get(b.parent_id)?.label ?? b.parent_id : '';
      return aParent.localeCompare(bParent) || a.label.localeCompare(b.label);
    });

    if (ring === 0) {
      if (ordered.length === 1) {
        const node = ordered[0];
        positioned.push({ ...node, x: centerX, y: centerY, ring });
      } else {
        const innerRadius = 50;
        ordered.forEach((node, index) => {
          const angle = (Math.PI * 2 * index) / ordered.length - Math.PI / 2;
          positioned.push({
            ...node,
            x: centerX + Math.cos(angle) * innerRadius,
            y: centerY + Math.sin(angle) * innerRadius,
            ring,
          });
        });
      }
      continue;
    }

    const ringRadius = ring * radiusStep;
    ordered.forEach((node, index) => {
      const angle = (Math.PI * 2 * index) / ordered.length - Math.PI / 2;
      positioned.push({
        ...node,
        x: centerX + Math.cos(angle) * ringRadius,
        y: centerY + Math.sin(angle) * ringRadius,
        ring,
      });
    });
  }

  return {
    nodes: positioned,
    bounds: {
      width: centerX * 2,
      height: centerY * 2,
      centerX,
      centerY,
      maxRing,
    },
  };
}

function getStepDisplay(step: ExecutionStep): StepDisplay | null {
  const raw = (step.raw_json ?? {}) as { step_display?: StepDisplay };
  return raw.step_display ?? null;
}

function operatorToSentence(operator: string | null | undefined) {
  switch (operator) {
    case '==':
    case '=':
      return 'is equal to';
    case '!=':
      return 'is not equal to';
    case '>':
      return 'is greater than';
    case '>=':
      return 'is greater than or equal to';
    case '<':
      return 'is less than';
    case '<=':
      return 'is less than or equal to';
    default:
      return 'is compared to';
  }
}

function humanizeValue(value: unknown) {
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (value == null) {
    return 'unknown';
  }

  return String(value);
}

function branchToSentence(branch: StepDisplay['branch_taken']) {
  switch (branch) {
    case 'True':
      return 'This check continues through the';
    case 'False':
      return 'This check continues through the';
    case 'Unknown':
      return 'This check continues through the';
    default:
      return 'This check continues to the next part of the rule.';
  }
}

export function BuildingGraphView({
  expanded = false,
  collapsed = false,
  onToggleExpanded,
  onToggleCollapsed,
  onRun,
}: Props) {
  const active_graph_data = useRuleBookStore((state) => state.active_graph_data);
  const graph_loaded = useRuleBookStore((state) => state.graph_loaded);
  const execution_timeline = useRuleBookStore((state) => state.execution_timeline);
  const current_step_index = useRuleBookStore((state) => state.current_step_index);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState<null | { x: number; y: number }>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [expandedLogStepKey, setExpandedLogStepKey] = useState<string | null>(null);
  const logScrollRef = useRef<HTMLDivElement | null>(null);

  const current_step = useMemo(() => {
    if (!execution_timeline) return null;
    return execution_timeline.steps[current_step_index] ?? null;
  }, [current_step_index, execution_timeline]);
  const visible_log_steps = useMemo(() => {
    if (!execution_timeline) {
      return [] as ExecutionStep[];
    }

    return execution_timeline.steps.slice(0, current_step_index + 1);
  }, [current_step_index, execution_timeline]);

  const executionFocusNodeIds = useMemo(() => {
    if (!current_step?.active_node_ids?.length) {
      return [] as string[];
    }

    return current_step.active_node_ids;
  }, [current_step]);

  const timelineVisitedNodeIds = useMemo(() => {
    if (!execution_timeline) {
      return new Set<string>();
    }

    const visited = new Set<string>();
    execution_timeline.steps.slice(0, current_step_index).forEach((step) => {
      step.active_node_ids?.forEach((nodeId) => visited.add(nodeId));
    });
    return visited;
  }, [current_step_index, execution_timeline]);

  const focusNodeIds = useMemo(
    () => (selectedNodeId ? [selectedNodeId] : executionFocusNodeIds),
    [executionFocusNodeIds, selectedNodeId]
  );
  const primaryFocusNodeId = focusNodeIds[0] ?? null;

  const layout = useMemo(() => buildGraphLayout(active_graph_data), [active_graph_data]);
  const positionedById = useMemo(
    () => new Map(layout.nodes.map((node) => [node.id, node])),
    [layout.nodes]
  );
  const hoveredNode = useMemo(
    () => layout.nodes.find((node) => node.id === hoveredNodeId) ?? null,
    [hoveredNodeId, layout.nodes]
  );
  const selectedNode = useMemo(
    () => layout.nodes.find((node) => node.id === primaryFocusNodeId) ?? null,
    [layout.nodes, primaryFocusNodeId]
  );
  const propertyBubbles = useMemo(() => buildPropertyBubbles(selectedNode), [selectedNode]);
  const graphNodesById = useMemo(
    () => new Map((active_graph_data?.nodes ?? []).map((node) => [node.id, node])),
    [active_graph_data]
  );

  const connectedNodeIds = useMemo(() => {
    if (!active_graph_data || focusNodeIds.length === 0) {
      return new Set<string>();
    }

    const connected = new Set<string>();
    active_graph_data.edges.forEach((edge) => {
      if (focusNodeIds.includes(edge.source) || focusNodeIds.includes(edge.target)) {
        connected.add(edge.source);
        connected.add(edge.target);
      }
    });
    focusNodeIds.forEach((nodeId) => connected.delete(nodeId));
    return connected;
  }, [active_graph_data, focusNodeIds]);

  const highlightedEdgeIds = useMemo(() => {
    if (!active_graph_data || focusNodeIds.length === 0) {
      return new Set<string>();
    }

    return new Set(
      active_graph_data.edges
        .filter((edge) => focusNodeIds.includes(edge.source) || focusNodeIds.includes(edge.target))
        .map((edge) => edge.id)
    );
  }, [active_graph_data, focusNodeIds]);

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setHoveredNodeId(null);
    setSelectedNodeId(null);
  }, [active_graph_data?.id, collapsed, expanded]);

  useEffect(() => {
    setSelectedNodeId(null);
    setExpandedLogStepKey(null);
  }, [execution_timeline]);

  useEffect(() => {
    if (!logScrollRef.current || visible_log_steps.length === 0) {
      return;
    }

    logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight;
  }, [current_step_index, visible_log_steps.length]);

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (collapsed) {
      return;
    }

    event.preventDefault();
    const nextZoom = Math.min(5, Math.max(0.2, zoom - event.deltaY * 0.002));
    setZoom(nextZoom);
  };

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (collapsed) {
      return;
    }

    setDragging({ x: event.clientX - pan.x, y: event.clientY - pan.y });
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!dragging || collapsed) return;
    setPan({ x: event.clientX - dragging.x, y: event.clientY - dragging.y });
  };

  const handleMouseUp = () => {
    setDragging(null);
  };

  const getVisualState = (nodeId: string): VisualNodeState => {
    if (focusNodeIds.includes(nodeId)) {
      return 2;
    }

    if (connectedNodeIds.has(nodeId) || timelineVisitedNodeIds.has(nodeId)) {
      return 3;
    }

    return 1;
  };

  const baseClass = expanded
    ? 'relative h-full min-h-[640px] overflow-hidden rounded-2xl border border-slate-300 bg-white'
    : collapsed
      ? 'relative h-[52px] overflow-hidden rounded-2xl border border-slate-200 bg-white'
      : 'relative h-full min-h-[420px] overflow-hidden rounded-2xl border border-slate-200 bg-white';

  const controlsWrapperClass = expanded
    ? 'absolute right-3 top-32 z-20 flex items-center gap-2'
    : collapsed
      ? 'absolute right-3 top-1/2 z-20 flex -translate-y-1/2 items-center gap-2'
      : 'absolute right-3 top-3 z-20 flex items-center gap-2';
  const logOverlayClass = expanded
    ? 'absolute right-3 top-[11.5rem] z-20 w-[26rem] max-w-[calc(100%-1.5rem)]'
    : 'absolute right-3 top-[3.75rem] bottom-3 z-20 w-[24rem] max-w-[calc(100%-1.5rem)]';

  return (
    <div className={baseClass}>
      {!collapsed ? (
        <>
          <div
            className="absolute inset-0"
            style={{
              backgroundColor: '#f8fafc',
              backgroundImage:
                'radial-gradient(circle at 1px 1px, rgba(148,163,184,0.45) 1px, transparent 0)',
              backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
              backgroundPosition: `${pan.x}px ${pan.y}px`,
            }}
          />

          {graph_loaded && active_graph_data ? (
            <>
              <div
                className="absolute inset-0 cursor-grab overflow-hidden active:cursor-grabbing"
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onClick={() => setSelectedNodeId(null)}
              >
                <svg
                  className="h-full w-full"
                  viewBox={`0 0 ${layout.bounds.width} ${layout.bounds.height}`}
                  preserveAspectRatio="xMidYMid meet"
                >
                  <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
                    {Array.from({ length: layout.bounds.maxRing }, (_, index) => index + 1).map((ring) => (
                      <circle
                        key={`ring-${ring}`}
                        cx={layout.bounds.centerX}
                        cy={layout.bounds.centerY}
                        r={ring * 118}
                        fill="rgba(255,255,255,0.18)"
                        stroke="rgba(100,116,139,0.32)"
                        strokeDasharray="6 10"
                        strokeWidth={2.5}
                      />
                    ))}

                    {selectedNode && propertyBubbles.length > 0 ? (
                      <circle
                        cx={selectedNode.x}
                        cy={selectedNode.y}
                        r={84}
                        fill="rgba(255,255,255,0.16)"
                        stroke="rgba(15,23,42,0.28)"
                        strokeDasharray="5 7"
                        strokeWidth={2}
                      />
                    ) : null}

                    {active_graph_data.edges.map((edge) => {
                      const source = positionedById.get(edge.source);
                      const target = positionedById.get(edge.target);
                      if (!source || !target) return null;
                      const highlighted = highlightedEdgeIds.has(edge.id);
                      const muted = focusNodeIds.length > 0 && !highlighted;

                      return (
                        <g key={edge.id} opacity={muted ? 0.2 : 1}>
                          <line
                            x1={source.x}
                            y1={source.y}
                            x2={target.x}
                            y2={target.y}
                            stroke={highlighted ? '#0f172a' : '#94a3b8'}
                            strokeOpacity={highlighted ? 0.95 : 0.45}
                            strokeWidth={highlighted ? 3 : 1.5}
                          />
                          {highlighted ? (
                            <text
                              x={(source.x + target.x) / 2}
                              y={(source.y + target.y) / 2 - 8}
                              textAnchor="middle"
                              fontSize="10"
                              fontWeight="600"
                              fill="#0f172a"
                              paintOrder="stroke"
                              stroke="rgba(255,255,255,0.92)"
                              strokeWidth={3}
                            >
                              {edge.relation}
                            </text>
                          ) : null}
                        </g>
                      );
                    })}

                    {propertyBubbles.map((property) => (
                      <g key={property.key} transform={`translate(${property.x} ${property.y})`}>
                        <circle r={22} fill="rgba(255,255,255,0.97)" stroke="#334155" strokeWidth={1.5} />
                        <text y={-2} textAnchor="middle" fontSize="8" fontWeight="700" fill="#0f172a">
                          {property.label}
                        </text>
                        <text y={9} textAnchor="middle" fontSize="7" fill="#475569">
                          {property.value}
                        </text>
                      </g>
                    ))}

                    {layout.nodes.map((node) => {
                      const result = current_step?.node_results[node.id];
                      const visualState = getVisualState(node.id);
                      const radius = visualState === 2 ? 26 : visualState === 3 ? 23 : 20;
                      const opacity = visualState === 1 ? 0.2 : visualState === 2 ? 1 : 0.72;
                      return (
                        <g
                          key={node.id}
                          transform={`translate(${node.x} ${node.y})`}
                          opacity={opacity}
                          onMouseEnter={() => setHoveredNodeId(node.id)}
                          onMouseLeave={() => setHoveredNodeId((value) => (value === node.id ? null : value))}
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedNodeId((value) => (value === node.id ? null : node.id));
                          }}
                          className="cursor-pointer"
                        >
                          <text
                            y={-34}
                            textAnchor="middle"
                            fontSize="11"
                            fontWeight={visualState === 2 ? '800' : '700'}
                            fill="#0f172a"
                          >
                            {node.kind}
                          </text>
                          <circle r={radius + (visualState === 2 ? 8 : 6)} fill={getResultHalo(result, visualState)} />
                          <circle
                            r={radius + 2}
                            fill={getNodeFill(node.kind)}
                            fillOpacity={visualState === 2 ? 0.22 : 0.14}
                            stroke={visualState === 2 ? '#0f172a' : 'rgba(255,255,255,0.75)'}
                            strokeWidth={visualState === 2 ? 3 : 1.5}
                          />
                          <circle
                            r={radius}
                            fill={getNodeFill(node.kind)}
                            stroke={getNodeStroke(result, visualState)}
                            strokeWidth={visualState === 2 ? 4 : visualState === 3 ? 3 : 2}
                          />
                          <circle r={visualState === 2 ? 6.5 : 5.5} fill="rgba(255,255,255,0.92)" />
                          <title>{node.label}</title>
                        </g>
                      );
                    })}
                  </g>
                </svg>
              </div>

              {hoveredNode ? (
                <div className="pointer-events-none absolute bottom-4 left-4 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-sm font-medium text-slate-700 shadow-sm">
                  {hoveredNode.label}
                </div>
              ) : null}
            </>
          ) : (
            <div className="relative flex h-full items-center justify-center">
              <div className="text-center">
                <div className="text-base font-semibold text-slate-700">Building graph view</div>
                <div className="mt-2 text-sm text-slate-500">
                  Load a building graph to inspect and visualize execution.
                </div>
              </div>
            </div>
          )}
        </>
      ) : null}

      <div className={controlsWrapperClass}>
        {!expanded && onRun ? (
          <button
            type="button"
            onClick={onRun}
            className="rounded-lg border border-slate-200 bg-white/95 p-2 text-slate-600 shadow-sm hover:bg-white"
            title="Run diagnostic check and fast-play log"
          >
            <PlayIcon className="h-4 w-4" />
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setZoom((value) => Math.min(5, value + 0.2))}
          className="rounded-lg border border-slate-200 bg-white/95 p-2 text-slate-600 shadow-sm hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
          title="Zoom in"
          disabled={collapsed}
        >
          <MagnifyingGlassPlusIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setZoom((value) => Math.max(0.2, value - 0.2))}
          className="rounded-lg border border-slate-200 bg-white/95 p-2 text-slate-600 shadow-sm hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
          title="Zoom out"
          disabled={collapsed}
        >
          <MagnifyingGlassMinusIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onToggleExpanded}
          className="rounded-lg border border-slate-200 bg-white/95 p-2 text-slate-600 shadow-sm hover:bg-white"
          title={expanded ? 'Exit graph focus mode' : 'Expand graph view'}
        >
          {expanded ? (
            <ArrowsPointingInIcon className="h-4 w-4" />
          ) : (
            <ArrowsPointingOutIcon className="h-4 w-4" />
          )}
        </button>
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="rounded-lg border border-slate-200 bg-white/95 p-2 text-slate-600 shadow-sm hover:bg-white"
          title={collapsed ? 'Expand graph canvas' : 'Collapse graph canvas'}
        >
          <Bars3Icon className="h-4 w-4" />
        </button>
      </div>

      {!collapsed && visible_log_steps.length > 0 ? (
        <div className={logOverlayClass}>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-lg backdrop-blur">
            <div className="border-b border-slate-200 px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-900">
                Rule execution log
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                Press play to run the test, press maximise for additional options.
              </div>
            </div>

            <div
              ref={logScrollRef}
              className={[
                'overflow-y-auto px-3 py-3',
                expanded ? 'max-h-[320px]' : 'h-[calc(100%-3.5rem)] max-h-[220px]',
              ].join(' ')}
            >
              <div className="space-y-3">
                {visible_log_steps.map((step, index) => {
                  const display = getStepDisplay(step);
                  const isTerminal = display?.event_type === 'chain_complete';
                  const isDecision = display?.event_type === 'node_visit';
                  const targetLabel =
                    display?.sample_target_label ??
                    step.active_node_ids?.join(', ') ??
                    'n/a';
                  const targetClass = display?.target_class_label ?? 'n/a';
                  const propertyLabel = display?.property_label ?? 'n/a';
                  const outcomeLabel = display?.outcome_label ?? 'check OK';
                  const stepKey = `${step.rule_id}-${step.step_index}-${index}`;
                  const isExpanded = expandedLogStepKey === stepKey;
                  const graphNode = display?.sample_target_label
                    ? graphNodesById.get(display.sample_target_label)
                    : null;
                  const graphPropertyValue =
                    display?.property_path && graphNode?.metadata
                      ? graphNode.metadata[display.property_path]
                      : undefined;
                  const branchLabel = display?.branch_taken ?? null;

                  return (
                    <button
                      type="button"
                      key={`${step.rule_id}-${step.step_index}-${index}`}
                      onClick={() =>
                        setExpandedLogStepKey((value) =>
                          value === stepKey ? null : stepKey
                        )
                      }
                      className={[
                        'w-full rounded-xl border px-3 py-3 text-left transition',
                        isTerminal
                          ? 'border-emerald-200 bg-emerald-50/80'
                          : isExpanded
                            ? 'border-sky-300 bg-sky-50/70'
                            : 'border-slate-200 bg-white/80 hover:border-slate-300 hover:bg-slate-50/80',
                      ].join(' ')}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs font-semibold text-slate-900">
                          Step {index + 1}
                        </div>
                        <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                          {isTerminal ? 'End node fired' : isDecision ? 'Decision' : 'Event'}
                        </div>
                      </div>

                      <div className="mt-2 grid grid-cols-[72px_1fr] gap-x-2 gap-y-1 text-[12px] leading-5">
                        <div className="font-semibold text-slate-500">Target</div>
                        <div className="font-medium text-slate-800">
                          {targetClass}: {targetLabel}
                        </div>

                        <div className="font-semibold text-slate-500">Property</div>
                        <div className="font-medium text-slate-800">
                          {propertyLabel}
                        </div>

                        <div className="font-semibold text-slate-500">Result</div>
                        <div className={isTerminal ? 'font-semibold text-emerald-800' : 'font-medium text-slate-800'}>
                          {outcomeLabel}
                        </div>
                      </div>

                      {isTerminal ? (
                        <div className="mt-2 rounded-lg border border-emerald-200 bg-white/80 px-2 py-2 text-[12px] text-emerald-900">
                          Stops at step {index + 1}
                          {display?.terminal_output ? `: ${display.terminal_output}` : ''}
                        </div>
                      ) : null}

                      {isExpanded && isDecision ? (
                        <div
                          className="mt-3 rounded-lg border border-sky-200 bg-white/90 px-3 py-3 text-[12px] text-slate-800"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <div className="text-slate-900 leading-6">
                            {display?.sample_target_label ? (
                              <>
                                The <strong>{targetClass}:</strong> {display.sample_target_label}{' '}
                                <strong>with the {propertyLabel}</strong> value of{' '}
                                {humanizeValue(graphPropertyValue)}{' '}
                                <strong>
                                  {operatorToSentence(display?.operator)}{' '}
                                  {display?.expected_value ?? 'n/a'}
                                </strong>
                                .{' '}
                                {branchLabel ? (
                                  <>
                                    This check continues through the{' '}
                                    <strong>{branchLabel}</strong> path to the next part of the rule.
                                  </>
                                ) : (
                                  branchToSentence(null)
                                )}
                              </>
                            ) : (
                              'No readable graph evidence available for this step.'
                            )}
                          </div>
                        </div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {expanded && !collapsed ? (
        <div className="absolute left-4 right-4 top-4 z-20">
          <ExecutionControls onRun={onRun} overlay showSolver />
        </div>
      ) : null}
    </div>
  );
}


import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import {
  Background,
  ControlButton,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeMouseHandler,
  type NodeTypes,
  type ReactFlowInstance,
  type Viewport,
} from '@xyflow/react';
import { toPng } from 'html-to-image';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  RuleBuilderWorkspace,
  RuleBuilderWorkspaceEdge,
  RuleBuilderWorkspaceNode,
  RuleBuilderWorkspacePayload,
} from '@/features/rulebuilder/api';
import {
  buildRuleTreeFromStart,
  detectCyclesInRules,
  extractRulesFromCanvasNodes,
} from '@/features/rulebuilder/buildTree';
import { BuildTreeRequest, BuiltTreeResult, RuleData } from '@/features/rulebuilder/editorStore';

import { getRuleElement } from '../api';
import RuleBranchEdge from './RuleBranchEdge';
import RuleElementNode from './RuleElementNode';

const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];
const MIN_CANVAS_ZOOM = 0.05;
const MAX_CANVAS_ZOOM = 1.5;
const FIT_VIEW_PADDING = 0.2;
const EXPORT_PIXEL_RATIO = 4;

type DragPayload = {
  kind: 'rule-node-template';
  nodeType: 'start' | 'decision' | 'end';
  label: string;
  template: Record<string, unknown>;
  source?: 'local' | 'api';
  element_id?: string;
};

type DuplicateRequest = {
  requestId: number;
  sourceNodeId: string;
} | null;

type DeleteRequest = {
  requestId: number;
  sourceNodeId: string;
} | null;

type DeriveRequest = {
  requestId: number;
  derivedRule: RuleData;
} | null;

type Props = {
  selectedNodeId: string | null;
  onSelectedNodeChange: (nodeId: string | null, rule: RuleData | null) => void;
  editedRule: RuleData | null;
  duplicateRequest: DuplicateRequest;
  deleteRequest: DeleteRequest;
  deriveRequest: DeriveRequest;
  buildTreeRequest?: BuildTreeRequest | null;
  onTreeBuilt?: (result: BuiltTreeResult) => void;
  builtRuleEdgePhase?: 'idle' | 'connected' | 'complete';
  workspaceToLoad?: RuleBuilderWorkspace | null;
  onWorkspaceStateChange?: (workspace: RuleBuilderWorkspacePayload | null) => void;
  completenessIssueNodeIds?: string[];
};

type BranchHandle = 'true' | 'false' | 'unknown';
type RuleBranch = 'true_path' | 'false_path' | 'unknown_path';

const nodeTypes: NodeTypes = {
  ruleElement: RuleElementNode,
};

function nextLabelWithBase(base: string, nodes: Node[]) {
  const cleanBase = (base || '').trim() || 'New rule element';

  const used = new Set(
    nodes
      .map((node: Node) => {
        const rule = node.data?.rule as RuleData | undefined;
        const label = rule?.label || node.data?.label;
        return typeof label === 'string' ? label.trim() : '';
      })
      .filter(Boolean),
  );

  if (!used.has(cleanBase)) return cleanBase;

  let i = 2;
  while (used.has(`${cleanBase} ${i}`)) {
    i += 1;
  }
  return `${cleanBase} ${i}`;
}

function handleToBranch(handle: BranchHandle): RuleBranch {
  if (handle === 'true') return 'true_path';
  if (handle === 'false') return 'false_path';
  return 'unknown_path';
}

function branchToHandle(branch: RuleBranch): BranchHandle {
  if (branch === 'true_path') return 'true';
  if (branch === 'false_path') return 'false';
  return 'unknown';
}

function buildEdgeId(sourceId: string, handle: BranchHandle, targetId: string) {
  return `${sourceId}::${handle}::${targetId}`;
}

function sanitizeCanvasFileName(rawLabel: string) {
  return (
    [...rawLabel]
      .filter((char) => {
        const code = char.charCodeAt(0);
        return !'<>:"/\\|?*'.includes(char) && (code < 0 || code > 31);
      })
      .join('')
      .trim() || 'rulebuilder-canvas'
  );
}

function cycleEdgeIdsFromRules(rules: RuleData[]) {
  const cycleEdgeIds = new Set<string>();

  for (const cycle of detectCyclesInRules(rules)) {
    const closedCycle =
      cycle.length > 0 && cycle[0] !== cycle[cycle.length - 1] ? [...cycle, cycle[0]] : cycle;

    for (let index = 0; index < closedCycle.length - 1; index += 1) {
      const sourceId = closedCycle[index];
      const targetId = closedCycle[index + 1];
      const sourceRule = rules.find((rule: RuleData) => rule.id === sourceId);
      if (!sourceRule) continue;

      if (sourceRule.true_path === targetId) {
        cycleEdgeIds.add(buildEdgeId(sourceId, 'true', targetId));
      }
      if (sourceRule.false_path === targetId) {
        cycleEdgeIds.add(buildEdgeId(sourceId, 'false', targetId));
      }
      if (sourceRule.unknown_path === targetId) {
        cycleEdgeIds.add(buildEdgeId(sourceId, 'unknown', targetId));
      }
    }
  }

  return cycleEdgeIds;
}

function clearTargetReferences(rule: RuleData, targetId: string): RuleData {
  return {
    ...rule,
    true_path: rule.true_path === targetId ? null : rule.true_path,
    false_path: rule.false_path === targetId ? null : rule.false_path,
    unknown_path: rule.unknown_path === targetId ? null : rule.unknown_path,
  };
}

function allowsMultipleIncoming(rule: RuleData | undefined | null) {
  return rule?.element_type === 'decision' || rule?.element_type === 'end';
}

function updateRuleBranch(rule: RuleData, branch: RuleBranch, targetId: string | null): RuleData {
  if (branch === 'true_path') {
    return { ...rule, true_path: targetId };
  }
  if (branch === 'false_path') {
    return { ...rule, false_path: targetId };
  }
  return { ...rule, unknown_path: targetId };
}

function buildEdgesFromNodes(nodes: Node[]): Edge[] {
  const nextEdges: Edge[] = [];

  for (const node of nodes) {
    const rule = node.data?.rule as RuleData | undefined;
    if (!rule) continue;

    const branches: Array<{ branch: RuleBranch; targetId: string | null | undefined }> = [
      { branch: 'true_path', targetId: rule.true_path },
      { branch: 'false_path', targetId: rule.false_path },
      { branch: 'unknown_path', targetId: rule.unknown_path },
    ];

    for (const item of branches) {
      if (!item.targetId) continue;

      const handle = branchToHandle(item.branch);

      nextEdges.push({
        id: buildEdgeId(node.id, handle, item.targetId),
        source: node.id,
        sourceHandle: handle,
        target: item.targetId,
        targetHandle: 'in',
        animated: false,
        data: {
          branch: item.branch,
        },
      });
    }
  }

  return nextEdges;
}

function currentEdgeById(edges: Edge[], edgeId: string) {
  return edges.find((edge: Edge) => edge.id === edgeId) || null;
}

function serializeWorkspaceNodes(nodes: Node[]): RuleBuilderWorkspaceNode[] {
  return nodes
    .map((node: Node) => {
      const rule = node.data?.rule as RuleData | undefined;
      if (!rule) return null;

      return {
        canvas_node_id: node.id,
        position: {
          x: node.position.x,
          y: node.position.y,
        },
        rule: {
          ...rule,
        },
      };
    })
    .filter((node): node is RuleBuilderWorkspaceNode => Boolean(node));
}

function serializeWorkspaceEdges(edges: Edge[]): RuleBuilderWorkspaceEdge[] {
  return edges.map((edge: Edge) => ({
    id: edge.id,
    source: edge.source,
    source_handle: typeof edge.sourceHandle === 'string' ? edge.sourceHandle : null,
    target: edge.target,
    target_handle: typeof edge.targetHandle === 'string' ? edge.targetHandle : null,
  }));
}

function buildWorkspacePayload(
  nodes: Node[],
  edges: Edge[],
  viewport: Viewport,
): RuleBuilderWorkspacePayload | null {
  const workspaceNodes = serializeWorkspaceNodes(nodes);
  const startNode = workspaceNodes.find(
    (node: RuleBuilderWorkspaceNode) => node.rule.element_type === 'start',
  );

  if (!startNode) {
    return null;
  }

  return {
    name: (startNode.rule.label || startNode.rule.id || 'RuleBuilder workspace').trim(),
    entry_node_id: startNode.rule.id,
    entry_node_label: (startNode.rule.label || startNode.rule.id || 'RuleBuilder workspace').trim(),
    viewport: {
      x: viewport.x,
      y: viewport.y,
      zoom: viewport.zoom,
    },
    nodes: workspaceNodes,
    edges: serializeWorkspaceEdges(edges),
  };
}

function RuleCanvasInner({
  selectedNodeId,
  onSelectedNodeChange,
  editedRule,
  duplicateRequest,
  deleteRequest,
  deriveRequest,
  buildTreeRequest,
  onTreeBuilt,
  builtRuleEdgePhase = 'idle',
  workspaceToLoad,
  onWorkspaceStateChange,
  completenessIssueNodeIds = [],
}: Props) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const lastHandledDuplicateRequestId = useRef<number | null>(null);
  const lastHandledDeleteRequestId = useRef<number | null>(null);
  const lastHandledDeriveRequestId = useRef<number | null>(null);
  const lastHandledBuildTreeRequestId = useRef<number | null>(null);
  const lastAppliedWorkspaceKey = useRef<string | null>(null);

  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);
  const [exportingImage, setExportingImage] = useState(false);

  const selectedRule = useMemo(() => {
    if (!selectedNodeId) return null;
    const node = nodes.find((item: Node) => item.id === selectedNodeId);
    return (node?.data?.rule as RuleData | undefined) || null;
  }, [nodes, selectedNodeId]);

  const visualNodes = useMemo(() => {
    const issueIds = new Set(completenessIssueNodeIds);

    return nodes.map((node: Node) => {
      const rule = node.data?.rule as RuleData | undefined;
      if (!rule) return node;

      const hasIncoming = edges.some((edge: Edge) => edge.target === node.id);
      const hasOutgoing = edges.some((edge: Edge) => edge.source === node.id);
      const isIsolated = !hasIncoming && !hasOutgoing;
      const visualState = issueIds.has(node.id)
        ? 'completeness-issue'
        : isIsolated
          ? 'dimmed'
          : 'normal';

      return {
        ...node,
        data: {
          ...node.data,
          visualState,
        },
      };
    });
  }, [completenessIssueNodeIds, edges, nodes]);

  const entryNodeFileName = useMemo(() => {
    const startNode = nodes.find((node: Node) => {
      const rule = node.data?.rule as RuleData | undefined;
      return rule?.element_type === 'start';
    });
    const startRule = startNode?.data?.rule as RuleData | undefined;
    const rawLabel = startRule?.label?.trim();

    if (!rawLabel) {
      return 'rulebuilder-canvas';
    }

    return sanitizeCanvasFileName(rawLabel);
  }, [nodes]);

  const visualEdges = useMemo(() => {
    const visual = getEdgeVisualProps(builtRuleEdgePhase);
    const cycleEdgeIds = cycleEdgeIdsFromRules(
      extractRulesFromCanvasNodes(nodes as Array<{ id: string; data?: { rule?: RuleData } }>),
    );

    return edges.map((edge: Edge) => ({
      ...edge,
      ...visual,
      style: cycleEdgeIds.has(edge.id)
        ? {
            ...(visual.style || {}),
            stroke: '#dc2626',
            strokeWidth: 3,
          }
        : visual.style,
    }));
  }, [edges, builtRuleEdgePhase, nodes]);

  const syncEdgesFromNodes = useCallback((nextNodes: Node[]) => {
    setEdges(buildEdgesFromNodes(nextNodes));
  }, []);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((current: Node[]) => applyNodeChanges(changes, current));
  }, []);

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const removedEdges = changes
        .flatMap((change: EdgeChange) =>
          change.type === 'remove' && 'id' in change ? [currentEdgeById(edges, change.id)] : [],
        )
        .filter((edge): edge is Edge => Boolean(edge));

      if (removedEdges.length > 0) {
        setNodes((current: Node[]) => {
          const nextNodes = current.map((node: Node) => {
            const rule = node.data?.rule as RuleData | undefined;
            if (!rule) return node;

            let nextRule = rule;

            for (const edge of removedEdges) {
              if (edge.source !== node.id) continue;
              const handle = edge.sourceHandle as BranchHandle | undefined;
              if (!handle) continue;

              const branch = handleToBranch(handle);
              const targetId = edge.target;

              if (nextRule[branch] === targetId) {
                nextRule = updateRuleBranch(nextRule, branch, null);
              }
            }

            if (nextRule === rule) return node;

            return {
              ...node,
              data: {
                ...node.data,
                label: nextRule.label || nextRule.id,
                rule: nextRule,
              },
            };
          });

          syncEdgesFromNodes(nextNodes);

          queueMicrotask(() => {
            if (!selectedNodeId) return;
            const selected = nextNodes.find((node: Node) => node.id === selectedNodeId);
            onSelectedNodeChange(
              selected?.id || null,
              (selected?.data?.rule as RuleData | undefined) || null,
            );
          });

          return nextNodes;
        });

        return;
      }

      setEdges((current: Edge[]) => applyEdgeChanges(changes, current));
    },
    [edges, onSelectedNodeChange, selectedNodeId, syncEdgesFromNodes],
  );

  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target || !params.sourceHandle) return;
      if (params.targetHandle !== 'in') return;
      if (params.source === params.target) return;
      if (
        params.sourceHandle !== 'true' &&
        params.sourceHandle !== 'false' &&
        params.sourceHandle !== 'unknown'
      ) {
        return;
      }

      const handle = params.sourceHandle as BranchHandle;
      const branch = handleToBranch(handle);
      const sourceId = params.source;
      const targetId = params.target;

      const targetNode = nodes.find((node: Node) => node.id === targetId);
      const targetRule = (targetNode?.data?.rule as RuleData | undefined) || null;
      if (targetRule?.element_type === 'start') {
        window.alert('Start rule elements cannot receive incoming connections.');
        return;
      }
      const allowSharedIncoming = allowsMultipleIncoming(targetRule);

      setNodes((current: Node[]) => {
        const nextNodes = current.map((node: Node) => {
          const rule = node.data?.rule as RuleData | undefined;
          if (!rule) return node;

          if (node.id === sourceId) {
            const nextRule = updateRuleBranch(rule, branch, targetId);
            return {
              ...node,
              data: {
                ...node.data,
                label: nextRule.label || nextRule.id,
                rule: nextRule,
              },
            };
          }

          if (allowSharedIncoming) {
            return node;
          }

          const isCurrentIncomingTarget =
            rule.true_path === targetId ||
            rule.false_path === targetId ||
            rule.unknown_path === targetId;

          if (isCurrentIncomingTarget) {
            const nextRule = clearTargetReferences(rule, targetId);
            return {
              ...node,
              data: {
                ...node.data,
                label: nextRule.label || nextRule.id,
                rule: nextRule,
              },
            };
          }

          return node;
        });

        const nextRules = extractRulesFromCanvasNodes(
          nextNodes as Array<{ id: string; data?: { rule?: RuleData } }>,
        );
        const cycleEdgeIds = cycleEdgeIdsFromRules(nextRules);
        const attemptedEdgeId = buildEdgeId(sourceId, handle, targetId);

        if (cycleEdgeIds.has(attemptedEdgeId)) {
          window.alert('Connection blocked: this edge would create a loop in the rule graph.');
          return current;
        }

        syncEdgesFromNodes(nextNodes);

        queueMicrotask(() => {
          if (!selectedNodeId) return;
          const selected = nextNodes.find((node: Node) => node.id === selectedNodeId);
          onSelectedNodeChange(
            selected?.id || null,
            (selected?.data?.rule as RuleData | undefined) || null,
          );
        });

        return nextNodes;
      });
    },
    [nodes, onSelectedNodeChange, selectedNodeId, syncEdgesFromNodes],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onNodeClick = useCallback<NodeMouseHandler>(
    (_event, node) => {
      onSelectedNodeChange(node.id, (node.data?.rule as RuleData) || null);
    },
    [onSelectedNodeChange],
  );

  const onPaneClick = useCallback(() => {
    onSelectedNodeChange(null, null);
  }, [onSelectedNodeChange]);

  const onDrop = useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault();

      const raw = event.dataTransfer.getData('application/firebim-rule-node');
      if (!raw || !reactFlowInstance || !wrapperRef.current) return;

      let payload: DragPayload;
      try {
        payload = JSON.parse(raw);
      } catch {
        return;
      }

      if (payload.kind !== 'rule-node-template') return;

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      let template = payload.template;

      if (payload.source === 'api' && payload.element_id) {
        try {
          const res = await getRuleElement(payload.element_id);
          template = res.rule_element;
        } catch (error) {
          console.error('Failed to fetch stored rule element JSON:', error);
        }
      }

      const canvasNodeId = `${payload.nodeType}-${crypto.randomUUID()}`;

      const templateLabel =
        typeof template === 'object' &&
        template !== null &&
        'label' in template &&
        typeof template.label === 'string' &&
        template.label
          ? template.label
          : payload.label;

      const baseLabel =
        payload.source === 'api' && templateLabel ? templateLabel : 'New rule element';

      setNodes((current: Node[]) => {
        const label = nextLabelWithBase(baseLabel, current);

        const rule: RuleData = {
          ...(template as RuleData),
          id: canvasNodeId,
          label,
          true_path: null,
          false_path: null,
          unknown_path: null,
          graph_uri: null,
          element_id: payload.element_id || null,
        };

        const newNode: Node = {
          id: canvasNodeId,
          type: 'ruleElement',
          position,
          data: {
            label,
            rule,
          },
        };

        const nextNodes = current.concat(newNode);

        syncEdgesFromNodes(nextNodes);

        queueMicrotask(() => {
          onSelectedNodeChange(canvasNodeId, rule);
        });

        return nextNodes;
      });
    },
    [reactFlowInstance, onSelectedNodeChange, syncEdgesFromNodes],
  );

  useEffect(() => {
    if (!buildTreeRequest || !onTreeBuilt) return;
    if (lastHandledBuildTreeRequestId.current === buildTreeRequest.requestId) return;

    lastHandledBuildTreeRequestId.current = buildTreeRequest.requestId;

    const rules = extractRulesFromCanvasNodes(
      nodes as Array<{ id: string; data?: { rule?: RuleData } }>,
    );
    const result = buildRuleTreeFromStart(buildTreeRequest.startNodeId, rules);

    onTreeBuilt(result);
  }, [buildTreeRequest, onTreeBuilt, nodes]);

  useEffect(() => {
    if (!selectedNodeId || !editedRule) return;
    if (editedRule.id !== selectedNodeId) return;

    setNodes((current) => {
      const nextNodes = current.map((node: Node) => {
        if (node.id !== selectedNodeId) return node;

        return {
          ...node,
          data: {
            ...node.data,
            label: editedRule.label || editedRule.id || node.data?.label,
            rule: editedRule,
          },
        };
      });

      syncEdgesFromNodes(nextNodes);
      return nextNodes;
    });
  }, [editedRule, selectedNodeId, syncEdgesFromNodes]);

  useEffect(() => {
    if (!duplicateRequest) return;
    if (lastHandledDuplicateRequestId.current === duplicateRequest.requestId) return;

    lastHandledDuplicateRequestId.current = duplicateRequest.requestId;

    setNodes((current: Node[]) => {
      const sourceNode = current.find((node: Node) => node.id === duplicateRequest.sourceNodeId);
      if (!sourceNode) return current;

      const sourceRule = (sourceNode.data?.rule as RuleData) || null;
      if (!sourceRule) return current;

      const newId = `${sourceRule.element_type}-${crypto.randomUUID()}`;
      const copiedBaseLabel = sourceRule.label || sourceRule.id || 'New rule element';
      const copiedLabel = nextLabelWithBase(copiedBaseLabel, current);

      const copiedRule: RuleData = {
        ...sourceRule,
        id: newId,
        label: copiedLabel,
        true_path: null,
        false_path: null,
        unknown_path: null,
        graph_uri: null,
        element_id: null,
      };

      const copiedNode: Node = {
        ...sourceNode,
        id: newId,
        type: 'ruleElement',
        position: {
          x: sourceNode.position.x + 40,
          y: sourceNode.position.y + 40,
        },
        data: {
          ...sourceNode.data,
          label: copiedRule.label || copiedRule.id,
          rule: copiedRule,
        },
        selected: false,
      };

      const nextNodes = current.concat(copiedNode);

      syncEdgesFromNodes(nextNodes);

      queueMicrotask(() => {
        onSelectedNodeChange(newId, copiedRule);
      });

      return nextNodes;
    });
  }, [duplicateRequest, onSelectedNodeChange, syncEdgesFromNodes]);

  useEffect(() => {
    if (!deleteRequest) return;
    if (lastHandledDeleteRequestId.current === deleteRequest.requestId) return;

    lastHandledDeleteRequestId.current = deleteRequest.requestId;

    setNodes((current: Node[]) => {
      const nextNodes = current
        .filter((node: Node) => node.id !== deleteRequest.sourceNodeId)
        .map((node: Node) => {
          const rule = node.data?.rule as RuleData | undefined;
          if (!rule) return node;

          const nextRule = clearTargetReferences(rule, deleteRequest.sourceNodeId);

          if (nextRule === rule) return node;

          return {
            ...node,
            data: {
              ...node.data,
              label: nextRule.label || nextRule.id,
              rule: nextRule,
            },
          };
        });

      syncEdgesFromNodes(nextNodes);
      return nextNodes;
    });

    queueMicrotask(() => {
      onSelectedNodeChange(null, null);
    });
  }, [deleteRequest, onSelectedNodeChange, syncEdgesFromNodes]);

  useEffect(() => {
    if (!deriveRequest) return;
    if (lastHandledDeriveRequestId.current === deriveRequest.requestId) return;

    lastHandledDeriveRequestId.current = deriveRequest.requestId;

    const derivedRule = deriveRequest.derivedRule;

    setNodes((current: Node[]) => {
      const label = nextLabelWithBase(
        derivedRule.label || derivedRule.id || 'New rule element',
        current,
      );

      const normalizedRule: RuleData = {
        ...derivedRule,
        id: derivedRule.id,
        label,
        graph_uri: null,
        element_id: null,
      };

      const newNode: Node = {
        id: derivedRule.id,
        type: 'ruleElement',
        position: { x: 120, y: 120 },
        data: {
          label,
          rule: normalizedRule,
        },
      };

      const nextNodes = current.concat(newNode);

      syncEdgesFromNodes(nextNodes);

      queueMicrotask(() => {
        onSelectedNodeChange(newNode.id, normalizedRule);
      });

      return nextNodes;
    });
  }, [deriveRequest, onSelectedNodeChange, syncEdgesFromNodes]);

  useEffect(() => {
    if (!selectedNodeId) return;
    const node = nodes.find((item: Node) => item.id === selectedNodeId);
    if (!node) {
      onSelectedNodeChange(null, null);
    }
  }, [nodes, onSelectedNodeChange, selectedNodeId]);

  useEffect(() => {
    if (!selectedNodeId) return;
    if (!selectedRule) {
      onSelectedNodeChange(null, null);
    }
  }, [selectedNodeId, selectedRule, onSelectedNodeChange]);

  const handleExportCanvas = useCallback(async () => {
    const canvas = wrapperRef.current?.querySelector('.react-flow__viewport') as HTMLElement | null;

    if (!canvas) {
      window.alert('Canvas export failed: no canvas was found.');
      return;
    }

    const suggestedName = entryNodeFileName;
    const enteredName = window.prompt('Save canvas as PNG', suggestedName);

    if (enteredName === null) {
      return;
    }

    const fileName = (enteredName.trim() || suggestedName).replace(/\.png$/i, '');

    try {
      setExportingImage(true);
      const dataUrl = await toPng(canvas, {
        cacheBust: true,
        pixelRatio: EXPORT_PIXEL_RATIO,
        backgroundColor: '#f9fafb',
      });

      const link = document.createElement('a');
      link.download = `${fileName}.png`;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error('Canvas export failed:', error);
      window.alert('Canvas export failed. Please try again.');
    } finally {
      setExportingImage(false);
    }
  }, [entryNodeFileName]);

  useEffect(() => {
    if (!reactFlowInstance || !onWorkspaceStateChange) return;

    onWorkspaceStateChange(buildWorkspacePayload(nodes, edges, reactFlowInstance.getViewport()));
  }, [edges, nodes, onWorkspaceStateChange, reactFlowInstance]);

  useEffect(() => {
    if (!workspaceToLoad) return;
    const workspaceKey = `${workspaceToLoad.id}:${workspaceToLoad.updated_at}`;
    if (lastAppliedWorkspaceKey.current === workspaceKey) return;
    lastAppliedWorkspaceKey.current = workspaceKey;

    const nextNodes: Node[] = workspaceToLoad.nodes.map((node: RuleBuilderWorkspaceNode) => ({
      id: node.canvas_node_id,
      type: 'ruleElement',
      position: {
        x: node.position.x,
        y: node.position.y,
      },
      data: {
        label: node.rule.label || node.rule.id,
        rule: {
          ...node.rule,
        },
      },
    }));

    const nextEdges: Edge[] = workspaceToLoad.edges.map((edge: RuleBuilderWorkspaceEdge) => ({
      id: edge.id,
      source: edge.source,
      sourceHandle: edge.source_handle ?? undefined,
      target: edge.target,
      targetHandle: edge.target_handle ?? undefined,
      animated: false,
      data:
        edge.source_handle === 'true'
          ? { branch: 'true_path' }
          : edge.source_handle === 'false'
            ? { branch: 'false_path' }
            : edge.source_handle === 'unknown'
              ? { branch: 'unknown_path' }
              : undefined,
    }));

    setNodes(nextNodes);
    setEdges(nextEdges);
    onSelectedNodeChange(null, null);
    onWorkspaceStateChange?.({
      name: workspaceToLoad.name,
      entry_node_id: workspaceToLoad.entry_node_id,
      entry_node_label: workspaceToLoad.entry_node_label,
      viewport: workspaceToLoad.viewport,
      nodes: workspaceToLoad.nodes,
      edges: workspaceToLoad.edges,
    });

    if (reactFlowInstance) {
      requestAnimationFrame(() => {
        void reactFlowInstance.setViewport(workspaceToLoad.viewport);
      });
    }
  }, [onSelectedNodeChange, onWorkspaceStateChange, reactFlowInstance, workspaceToLoad]);

  return (
    <div ref={wrapperRef} className="h-full w-full" onDragOver={onDragOver} onDrop={onDrop}>
      <ReactFlow
        nodes={visualNodes}
        edges={visualEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        minZoom={MIN_CANVAS_ZOOM}
        maxZoom={MAX_CANVAS_ZOOM}
        fitViewOptions={{
          minZoom: MIN_CANVAS_ZOOM,
          maxZoom: MAX_CANVAS_ZOOM,
          padding: FIT_VIEW_PADDING,
        }}
        onInit={setReactFlowInstance}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onMoveEnd={() => {
          if (!reactFlowInstance || !onWorkspaceStateChange) return;
          onWorkspaceStateChange(
            buildWorkspacePayload(nodes, edges, reactFlowInstance.getViewport()),
          );
        }}
        fitView
      >
        <Controls>
          <ControlButton
            onClick={() => {
              void handleExportCanvas();
            }}
            disabled={exportingImage}
            title="Save canvas as PNG"
            aria-label="Save canvas as PNG"
          >
            <ArrowDownTrayIcon className="h-4 w-4" />
          </ControlButton>
        </Controls>
        <Background />
      </ReactFlow>
    </div>
  );
}

const edgeTypes = {
  ruleBranch: RuleBranchEdge,
};

function getEdgeVisualProps(phase: 'idle' | 'connected' | 'complete') {
  switch (phase) {
    case 'connected':
      return {
        type: 'ruleBranch',
        animated: false,
        style: {
          strokeWidth: 3,
          strokeDasharray: '8 4',
        },
      };

    case 'complete':
      return {
        type: 'ruleBranch',
        animated: true,
        style: {
          strokeWidth: 3,
          strokeDasharray: '8 4',
        },
      };

    default:
      return {
        type: 'ruleBranch',
        animated: false,
        style: {
          strokeWidth: 1.5,
        },
      };
  }
}

export default function RuleCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <RuleCanvasInner {...props} />
    </ReactFlowProvider>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { getRuleElementJson } from '../api';

const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];

type RuleData = {
  id: string;
  node_type: 'start' | 'decision' | 'end';
  label?: string | null;
  target_class?: string | null;
  property_path?: string | null;
  operator?: string | null;
  value?: unknown;
  true_path?: string | null;
  false_path?: string | null;
  unknown_path?: string | null;
  config?: Record<string, unknown>;
  graph_uri?: string | null;
};

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
};

function nextLabelWithBase(base: string, nodes: Node[]) {
  const cleanBase = (base || '').trim() || 'New rule element';

  const used = new Set(
    nodes
      .map((node) => {
        const rule = node.data?.rule as RuleData | undefined;
        const label = rule?.label || node.data?.label;
        return typeof label === 'string' ? label.trim() : '';
      })
      .filter(Boolean)
  );

  if (!used.has(cleanBase)) return cleanBase;

  let i = 2;
  while (used.has(`${cleanBase} ${i}`)) {
    i += 1;
  }
  return `${cleanBase} ${i}`;
}

function RuleCanvasInner({
  selectedNodeId,
  onSelectedNodeChange,
  editedRule,
  duplicateRequest,
  deleteRequest,
  deriveRequest,
}: Props) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const lastHandledDuplicateRequestId = useRef<number | null>(null);
  const lastHandledDeleteRequestId = useRef<number | null>(null);
  const lastHandledDeriveRequestId = useRef<number | null>(null);

  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback(
    (params: Connection) => setEdges((current) => addEdge(params, current)),
    [setEdges]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onNodeClick = useCallback<NodeMouseHandler>(
    (_event, node) => {
      onSelectedNodeChange(node.id, (node.data?.rule as RuleData) || null);
    },
    [onSelectedNodeChange]
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
          const res = await getRuleElementJson(payload.element_id);
          template = res.rule_element;
        } catch (error) {
          console.error('Failed to fetch stored rule element JSON:', error);
        }
      }

      const id = `${payload.nodeType}-${crypto.randomUUID()}`;

      const templateLabel =
        typeof template === 'object' &&
        template !== null &&
        'label' in template &&
        typeof template.label === 'string' &&
        template.label
          ? template.label
          : payload.label;

      const baseLabel =
        payload.source === 'api' && templateLabel
          ? templateLabel
          : 'New rule element';

      const label = nextLabelWithBase(baseLabel, nodes);

      const rule: RuleData = {
        ...(template as RuleData),
        id,
        label,
      };

      const newNode: Node = {
        id,
        type: 'default',
        position,
        data: {
          label,
          rule,
        },
      };

      setNodes((current) => current.concat(newNode));
      onSelectedNodeChange(id, rule);
    },
    [reactFlowInstance, nodes, setNodes, onSelectedNodeChange]
  );

  useEffect(() => {
    if (!selectedNodeId || !editedRule) return;

    setNodes((current) =>
      current.map((node) => {
        if (node.id !== selectedNodeId) return node;

        return {
          ...node,
          data: {
            ...node.data,
            label: editedRule.label || editedRule.id || node.data?.label,
            rule: editedRule,
          },
        };
      })
    );
  }, [editedRule, selectedNodeId, setNodes]);

  useEffect(() => {
    if (!duplicateRequest) return;
    if (lastHandledDuplicateRequestId.current === duplicateRequest.requestId) return;

    lastHandledDuplicateRequestId.current = duplicateRequest.requestId;

    setNodes((current) => {
      const sourceNode = current.find((node) => node.id === duplicateRequest.sourceNodeId);
      if (!sourceNode) return current;

      const sourceRule = (sourceNode.data?.rule as RuleData) || null;
      if (!sourceRule) return current;

      const newId = `${sourceRule.node_type}-${crypto.randomUUID()}`;
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
      };

      const copiedNode: Node = {
        ...sourceNode,
        id: newId,
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

      queueMicrotask(() => {
        onSelectedNodeChange(newId, copiedRule);
      });

      return current.concat(copiedNode);
    });
  }, [duplicateRequest, setNodes, onSelectedNodeChange]);

  useEffect(() => {
    if (!deleteRequest) return;
    if (lastHandledDeleteRequestId.current === deleteRequest.requestId) return;

    lastHandledDeleteRequestId.current = deleteRequest.requestId;

    setNodes((current) => current.filter((node) => node.id !== deleteRequest.sourceNodeId));

    setEdges((current) =>
      current.filter(
        (edge) =>
          edge.source !== deleteRequest.sourceNodeId &&
          edge.target !== deleteRequest.sourceNodeId
      )
    );

    queueMicrotask(() => {
      onSelectedNodeChange(null, null);
    });
  }, [deleteRequest, setNodes, setEdges, onSelectedNodeChange]);

  useEffect(() => {
    if (!deriveRequest) return;
    if (lastHandledDeriveRequestId.current === deriveRequest.requestId) return;

    lastHandledDeriveRequestId.current = deriveRequest.requestId;

    const derivedRule = deriveRequest.derivedRule;

    setNodes((current) => {
      const label = nextLabelWithBase(
        derivedRule.label || derivedRule.id || 'New rule element',
        current
      );

      const newNode: Node = {
        id: derivedRule.id,
        type: 'default',
        position: { x: 120, y: 120 },
        data: {
          label,
          rule: {
            ...derivedRule,
            label,
            graph_uri: null,
          },
        },
      };

      queueMicrotask(() => {
        onSelectedNodeChange(newNode.id, newNode.data.rule as RuleData);
      });

      return current.concat(newNode);
    });
  }, [deriveRequest, setNodes, onSelectedNodeChange]);

  return (
    <div ref={wrapperRef} className="h-full w-full" onDragOver={onDragOver} onDrop={onDrop}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onInit={setReactFlowInstance}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        fitView
      >
        <MiniMap />
        <Controls />
        <Background />
      </ReactFlow>
    </div>
  );
}

export default function RuleCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <RuleCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
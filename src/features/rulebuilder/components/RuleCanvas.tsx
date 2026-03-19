import { useCallback, useRef, useState } from 'react';
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
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];

type DragPayload = {
  kind: 'rule-node-template';
  nodeType: 'start' | 'decision' | 'end';
  label: string;
  template: Record<string, unknown>;
};

function makeNodeLabel(payload: DragPayload) {
  return String(payload.template?.label || payload.label || payload.nodeType);
}

function RuleCanvasInner() {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
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

  const onDrop = useCallback(
    (event: React.DragEvent) => {
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

      const bounds = wrapperRef.current.getBoundingClientRect();
      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });

      const id = `${payload.nodeType}-${crypto.randomUUID()}`;

      const newNode: Node = {
        id,
        type: 'default',
        position,
        data: {
          label: makeNodeLabel(payload),
          rule: {
            id,
            ...payload.template,
          },
        },
      };

      setNodes((current) => current.concat(newNode));
    },
    [reactFlowInstance, setNodes]
  );

  return (
    <div ref={wrapperRef} className="h-full w-full" onDragOver={onDragOver} onDrop={onDrop}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onInit={setReactFlowInstance}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
      >
        <MiniMap />
        <Controls />
        <Background />
      </ReactFlow>
    </div>
  );
}

export default function RuleCanvas() {
  return (
    <ReactFlowProvider>
      <RuleCanvasInner />
    </ReactFlowProvider>
  );
}
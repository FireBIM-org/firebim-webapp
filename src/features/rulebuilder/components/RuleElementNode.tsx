import { Handle, Position, type NodeProps } from '@xyflow/react';

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

function typeBadge(nodeType: RuleData['node_type']) {
  if (nodeType === 'start') return 'Start';
  if (nodeType === 'end') return 'End';
  return 'Decision';
}

export default function RuleElementNode({ data, selected }: NodeProps) {
  const rule = (data?.rule || null) as RuleData | null;

  if (!rule) {
    return (
      <div className="min-w-[220px] rounded-md border border-slate-300 bg-white px-3 py-2 shadow-sm">
        <div className="text-sm font-medium text-slate-700">Invalid node</div>
      </div>
    );
  }

  const label = rule.label || rule.id || 'Unnamed rule element';

  return (
    <div
      className={[
        'relative min-w-[220px] rounded-lg border bg-white shadow-sm',
        selected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-slate-300',
      ].join(' ')}
    >
      <Handle
        type="target"
        id="in"
        position={Position.Top}
        className="!h-3 !w-3 !border-2 !border-slate-500 !bg-white"
      />

      <div className="border-b border-slate-200 px-3 py-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {typeBadge(rule.node_type)}
        </div>
        <div className="mt-1 text-sm font-semibold text-slate-900">{label}</div>

        {rule.node_type === 'decision' && (
          <div className="mt-2 space-y-1 text-xs text-slate-600">
            <div>
              <span className="font-medium">Target:</span>{' '}
              {rule.target_class || '—'}
            </div>
            <div>
              <span className="font-medium">Property:</span>{' '}
              {rule.property_path || '—'}
            </div>
            <div>
              <span className="font-medium">Operator:</span>{' '}
              {rule.operator || '—'}
            </div>
          </div>
        )}
      </div>

      <div className="relative h-12 px-3">
        <div className="absolute left-[12%] top-2 -translate-x-1/2 text-[10px] font-medium text-slate-500">
          True
        </div>
        <div className="absolute left-1/2 top-2 -translate-x-1/2 text-[10px] font-medium text-slate-500">
          False
        </div>
        <div className="absolute left-[88%] top-2 -translate-x-1/2 text-[10px] font-medium text-slate-500">
          Unknown
        </div>

        <Handle
          type="source"
          id="true"
          position={Position.Bottom}
          style={{ left: '12%' }}
          className="!h-3 !w-3 !border-2 !border-emerald-600 !bg-white"
        />
        <Handle
          type="source"
          id="false"
          position={Position.Bottom}
          style={{ left: '50%' }}
          className="!h-3 !w-3 !border-2 !border-rose-600 !bg-white"
        />
        <Handle
          type="source"
          id="unknown"
          position={Position.Bottom}
          style={{ left: '88%' }}
          className="!h-3 !w-3 !border-2 !border-amber-600 !bg-white"
        />
      </div>
    </div>
  );
}
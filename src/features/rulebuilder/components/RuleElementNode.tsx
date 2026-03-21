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

function getNodePalette(nodeType: RuleData['node_type']) {
  if (nodeType === 'start') {
    return {
      border: 'border-sky-500',
      ring: 'ring-sky-200',
      badge: 'text-sky-700',
      header: 'bg-sky-50 border-sky-200',
      body: 'bg-white',
    };
  }

  if (nodeType === 'end') {
    return {
      border: 'border-violet-500',
      ring: 'ring-violet-200',
      badge: 'text-violet-700',
      header: 'bg-violet-50 border-violet-200',
      body: 'bg-white',
    };
  }

  return {
    border: 'border-slate-300',
    ring: 'ring-slate-200',
    badge: 'text-slate-700',
    header: 'bg-slate-50 border-slate-200',
    body: 'bg-white',
  };
}

function typeBadge(nodeType: RuleData['node_type']) {
  if (nodeType === 'start') return 'Start';
  if (nodeType === 'end') return 'End';
  return 'Decision';
}

function getEndOutputText(rule: RuleData) {
  const outputText =
    typeof rule.config?.output_text === 'string' ? rule.config.output_text : null;

  return outputText || 'No output text defined';
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

  const palette = getNodePalette(rule.node_type);
  const label = rule.label || rule.id || 'Unnamed rule element';

  const showInput = rule.node_type !== 'start';
  const showTrueOutput = rule.node_type === 'start' || rule.node_type === 'decision';
  const showFalseOutput = rule.node_type === 'decision';
  const showUnknownOutput = rule.node_type === 'decision';

  return (
    <div
      className={[
        'relative min-w-[240px] rounded-lg border shadow-sm',
        palette.body,
        selected ? `${palette.border} ring-2 ${palette.ring}` : palette.border,
      ].join(' ')}
    >
      {showInput && (
        <Handle
          type="target"
          id="in"
          position={Position.Top}
          className="!h-3 !w-3 !border-2 !border-slate-500 !bg-white"
        />
      )}

      <div className={`border-b px-3 py-2 ${palette.header}`}>
        <div className={`text-[11px] font-semibold uppercase tracking-wide ${palette.badge}`}>
          {typeBadge(rule.node_type)}
        </div>
        <div className="mt-1 text-sm font-semibold text-slate-900">{label}</div>
      </div>

      {rule.node_type === 'decision' && (
        <div className="px-3 py-2 text-xs text-slate-600">
          <div>
            <span className="font-medium">Target:</span> {rule.target_class || '—'}
          </div>
          <div className="mt-1">
            <span className="font-medium">Property:</span> {rule.property_path || '—'}
          </div>
          <div className="mt-1">
            <span className="font-medium">Operator:</span> {rule.operator || '—'}
          </div>
          <div className="mt-1">
            <span className="font-medium">Value:</span>{' '}
            {rule.value === null || rule.value === undefined || rule.value === ''
              ? '—'
              : String(rule.value)}
          </div>
        </div>
      )}

      {rule.node_type === 'end' && (
        <div className="px-3 py-2 text-xs text-slate-600">
          <div>
            <span className="font-medium">Output:</span>
          </div>
          <div className="mt-1 rounded-md bg-violet-50 px-2 py-2 text-slate-700">
            {getEndOutputText(rule)}
          </div>
        </div>
      )}

      {(showTrueOutput || showFalseOutput || showUnknownOutput) && (
        <div className="relative h-12 px-3">
          {showTrueOutput && (
            <>
              <div
                className={`absolute top-2 -translate-x-1/2 text-[10px] font-medium text-slate-500 ${
                  rule.node_type === 'start' ? 'left-1/2' : 'left-[12%]'
                }`}
              >
                {rule.node_type === 'start' ? 'Next' : 'True'}
              </div>

              <Handle
                type="source"
                id="true"
                position={Position.Bottom}
                style={{ left: rule.node_type === 'start' ? '50%' : '12%' }}
                className="!h-3 !w-3 !border-2 !border-emerald-600 !bg-white"
              />
            </>
          )}

          {showFalseOutput && (
            <>
              <div className="absolute left-1/2 top-2 -translate-x-1/2 text-[10px] font-medium text-slate-500">
                False
              </div>
              <Handle
                type="source"
                id="false"
                position={Position.Bottom}
                style={{ left: '50%' }}
                className="!h-3 !w-3 !border-2 !border-rose-600 !bg-white"
              />
            </>
          )}

          {showUnknownOutput && (
            <>
              <div className="absolute left-[88%] top-2 -translate-x-1/2 text-[10px] font-medium text-slate-500">
                Unknown
              </div>
              <Handle
                type="source"
                id="unknown"
                position={Position.Bottom}
                style={{ left: '88%' }}
                className="!h-3 !w-3 !border-2 !border-amber-600 !bg-white"
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
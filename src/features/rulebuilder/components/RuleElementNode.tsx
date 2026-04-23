import { Handle, Position, type NodeProps } from '@xyflow/react';

import { classifyTerminalSentimentFromMany } from '../../../lib/ruleSentiment';

type RuleData = {
  id: string;
  element_type: 'start' | 'decision' | 'end';
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
  element_id?: string | null;
};

type VisualState = 'normal' | 'dimmed' | 'completeness-issue';

function getEndOutputText(rule: RuleData) {
  const outputText = typeof rule.config?.output_text === 'string' ? rule.config.output_text : null;

  return outputText || 'No output text defined';
}

function getEndNodeSentiment(rule: RuleData) {
  return classifyTerminalSentimentFromMany([
    rule.label,
    typeof rule.value === 'string' ? rule.value : rule.value == null ? null : String(rule.value),
    getEndOutputText(rule),
  ]);
}

export function getNodePalette(
  nodeType: RuleData['element_type'],
  endSentiment?: ReturnType<typeof getEndNodeSentiment>,
) {
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
    if (endSentiment === 'failure') {
      return {
        border: 'border-rose-700',
        ring: 'ring-rose-300',
        badge: 'text-rose-700',
        header: 'bg-rose-50 border-rose-200',
        body: 'bg-white',
        output: 'bg-rose-50 text-rose-900',
      };
    }

    if (endSentiment === 'warning') {
      return {
        border: 'border-amber-700',
        ring: 'ring-amber-300',
        badge: 'text-amber-700',
        header: 'bg-amber-50 border-amber-200',
        body: 'bg-white',
        output: 'bg-amber-50 text-amber-900',
      };
    }

    if (endSentiment === 'success') {
      return {
        border: 'border-emerald-700',
        ring: 'ring-emerald-300',
        badge: 'text-emerald-700',
        header: 'bg-emerald-50 border-emerald-200',
        body: 'bg-white',
        output: 'bg-emerald-50 text-emerald-900',
      };
    }

    return {
      border: 'border-violet-700',
      ring: 'ring-violet-300',
      badge: 'text-violet-700',
      header: 'bg-violet-50 border-violet-200',
      body: 'bg-white',
      output: 'bg-violet-50 text-slate-700',
    };
  }

  return {
    border: 'border-slate-300',
    ring: 'ring-slate-200',
    badge: 'text-slate-700',
    header: 'bg-slate-50 border-slate-200',
    body: 'bg-white',
    output: 'bg-slate-50 text-slate-700',
  };
}

function typeBadge(nodeType: RuleData['element_type']) {
  if (nodeType === 'start') return 'Start';
  if (nodeType === 'end') return 'End';
  return 'Decision';
}

export default function RuleElementNode({ data, selected }: NodeProps) {
  const rule = (data?.rule || null) as RuleData | null;
  const visualState = ((data?.visualState as VisualState | undefined) || 'normal') as VisualState;

  if (!rule) {
    return (
      <div className="min-w-[220px] rounded-xl border border-slate-300 bg-white px-3 py-2 shadow-xl">
        <div className="text-sm font-medium text-slate-700">Invalid rule element</div>
      </div>
    );
  }

  const endSentiment = rule.element_type === 'end' ? getEndNodeSentiment(rule) : null;
  const palette = getNodePalette(rule.element_type, endSentiment);
  const label = rule.label || rule.id || 'Unnamed rule element';

  const showInput = rule.element_type !== 'start';
  const showTrueOutput = rule.element_type === 'start' || rule.element_type === 'decision';
  const showFalseOutput = rule.element_type === 'decision';
  const showUnknownOutput = rule.element_type === 'decision';
  const isDimmed = visualState === 'dimmed';
  const isCompletenessIssue = visualState === 'completeness-issue';

  return (
    <div
      className={[
        'relative min-w-[240px] rounded-xl border-2',
        isCompletenessIssue
          ? 'border-slate-600 bg-slate-200 shadow-[0_0_48px_rgba(51,65,85,0.9)]'
          : '',
        isDimmed ? 'border-slate-300 bg-slate-100 opacity-65 shadow-lg grayscale-[0.25]' : '',
        !isCompletenessIssue && !isDimmed ? `shadow-xl ${palette.body}` : '',
        selected ? `${palette.border} ring-3 ${palette.ring}` : palette.border,
      ].join(' ')}
    >
      {showInput && (
        <Handle
          type="target"
          id="in"
          position={Position.Top}
          className="!h-3 !w-3 !border-4 !border-slate-500 !bg-white"
        />
      )}

      <div
        className={`rounded-xl border-1 px-3 py-2 ${
          isCompletenessIssue
            ? 'border-slate-500 bg-slate-300'
            : isDimmed
              ? 'border-slate-300 bg-slate-200'
              : palette.header
        }`}
      >
        <div
          className={`text-[11px] font-semibold tracking-wide uppercase ${
            isCompletenessIssue || isDimmed ? 'text-slate-700' : palette.badge
          }`}
        >
          {typeBadge(rule.element_type)}
        </div>
        <div
          className={`mt-1 text-sm font-semibold ${isCompletenessIssue ? 'text-slate-950' : 'text-slate-900'}`}
        >
          {label}
        </div>
      </div>

      {rule.element_type === 'decision' && (
        <div
          className={`px-3 py-2 text-xs ${isCompletenessIssue ? 'text-slate-800' : 'text-slate-600'}`}
        >
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

      {rule.element_type === 'end' && (
        <div
          className={`px-3 py-2 text-xs ${isCompletenessIssue ? 'text-slate-800' : 'text-slate-600'}`}
        >
          <div>
            <span className="font-medium">Output:</span>
          </div>
          <div
            className={`mt-3 rounded-xl px-2 py-2 ${
              isCompletenessIssue ? 'bg-slate-400 text-slate-950' : palette.output
            }`}
          >
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
                  rule.element_type === 'start' ? 'left-1/2' : 'left-[12%]'
                }`}
              >
                {rule.element_type === 'start' ? 'Next' : 'True'}
              </div>

              <Handle
                type="source"
                id="true"
                position={Position.Bottom}
                style={{ left: rule.element_type === 'start' ? '50%' : '12%' }}
                className="!h-3 !w-3 !border-2 !border-emerald-600 !bg-white"
              />
            </>
          )}

          {showFalseOutput && (
            <>
              <div className="absolute top-2 left-1/2 -translate-x-1/2 text-[10px] font-medium text-slate-500">
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
              <div className="absolute top-2 left-[88%] -translate-x-1/2 text-[10px] font-medium text-slate-500">
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

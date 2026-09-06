import { Handle, Position, type NodeProps } from '@xyflow/react';

import type { RuleData } from '@/features/rulebuilder/editorStore';

import { classifyTerminalSentimentFromMany } from '../../../lib/ruleSentiment';

export function isValueRef(value: unknown): value is { $ref: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { $ref?: unknown }).$ref === 'string'
  );
}

export function formatValue(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (isValueRef(value)) return `= ${value.$ref}`;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

type VisualState = 'normal' | 'dimmed' | 'completeness-issue' | 'ontology-issue';

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

  if (nodeType === 'derive') {
    return {
      border: 'border-indigo-500',
      ring: 'ring-indigo-200',
      badge: 'text-indigo-700',
      header: 'bg-indigo-50 border-indigo-200',
      body: 'bg-white',
      output: 'bg-indigo-50 text-indigo-900',
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
  if (nodeType === 'derive') return 'Derive';
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
  const isDerive = rule.element_type === 'derive';
  const showTrueOutput =
    rule.element_type === 'start' || rule.element_type === 'decision' || isDerive;
  const showFalseOutput = rule.element_type === 'decision';
  const showUnknownOutput = rule.element_type === 'decision' || isDerive;
  const trueLabel = rule.element_type === 'start' ? 'Next' : isDerive ? 'Written' : 'True';
  const unknownLabel = isDerive ? 'Missing input' : 'Unknown';
  const trueHandleLeft = rule.element_type === 'start' ? '50%' : isDerive ? '25%' : '12%';
  const unknownHandleLeft = isDerive ? '75%' : '88%';
  const isDimmed = visualState === 'dimmed';
  const isCompletenessIssue = visualState === 'completeness-issue';
  const isOntologyIssue = visualState === 'ontology-issue';

  return (
    <div
      className={[
        'relative min-w-[240px] rounded-xl border-2',
        isOntologyIssue
          ? 'border-red-600 bg-red-50 shadow-[0_0_38px_rgba(220,38,38,0.45)]'
          : isCompletenessIssue
            ? 'border-slate-600 bg-slate-200 shadow-[0_0_48px_rgba(51,65,85,0.9)]'
            : '',
        isDimmed ? 'border-slate-300 bg-slate-100 opacity-65 shadow-lg grayscale-[0.25]' : '',
        !isOntologyIssue && !isCompletenessIssue && !isDimmed ? `shadow-xl ${palette.body}` : '',
        isOntologyIssue
          ? 'border-red-600 ring-3 ring-red-200'
          : selected
            ? `${palette.border} ring-3 ${palette.ring}`
            : palette.border,
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
          isOntologyIssue
            ? 'border-red-300 bg-red-100'
            : isCompletenessIssue
              ? 'border-slate-500 bg-slate-300'
              : isDimmed
                ? 'border-slate-300 bg-slate-200'
                : palette.header
        }`}
      >
        <div
          className={`text-[11px] font-semibold tracking-wide uppercase ${
            isOntologyIssue
              ? 'text-red-800'
              : isCompletenessIssue || isDimmed
                ? 'text-slate-700'
                : palette.badge
          }`}
        >
          {isOntologyIssue ? 'Ontology issue' : typeBadge(rule.element_type)}
        </div>
        <div
          className={`mt-1 text-sm font-semibold ${isOntologyIssue ? 'text-red-950' : isCompletenessIssue ? 'text-slate-950' : 'text-slate-900'}`}
        >
          {label}
        </div>
      </div>

      {rule.element_type === 'decision' && (
        <div
          className={`px-3 py-2 text-xs ${isOntologyIssue ? 'text-red-900' : isCompletenessIssue ? 'text-slate-800' : 'text-slate-600'}`}
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
            <span className="font-medium">Value:</span> {formatValue(rule.value) ?? '—'}
          </div>
        </div>
      )}

      {isDerive && (
        <div
          className={`px-3 py-2 text-xs ${isOntologyIssue ? 'text-red-900' : isCompletenessIssue ? 'text-slate-800' : 'text-slate-600'}`}
        >
          <div>
            <span className="font-medium">Target:</span> {rule.target_class || '—'}
          </div>
          <div className="mt-1">
            <span className="font-medium">Writes:</span> {rule.property_path || '—'}
          </div>
          <div className="mt-1">
            <span className="font-medium">Expression:</span>
          </div>
          <div
            className={`mt-1 truncate rounded-lg px-2 py-1 font-mono text-[11px] ${
              isCompletenessIssue ? 'bg-slate-400 text-slate-950' : palette.output
            }`}
            title={rule.expression?.trim() || undefined}
          >
            {rule.expression?.trim() || '—'}
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
                className="absolute top-2 -translate-x-1/2 text-[10px] font-medium whitespace-nowrap text-slate-500"
                style={{ left: trueHandleLeft }}
              >
                {trueLabel}
              </div>

              <Handle
                type="source"
                id="true"
                position={Position.Bottom}
                style={{ left: trueHandleLeft }}
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
              <div
                className="absolute top-2 -translate-x-1/2 text-[10px] font-medium whitespace-nowrap text-slate-500"
                style={{ left: unknownHandleLeft }}
              >
                {unknownLabel}
              </div>
              <Handle
                type="source"
                id="unknown"
                position={Position.Bottom}
                style={{ left: unknownHandleLeft }}
                className="!h-3 !w-3 !border-2 !border-amber-600 !bg-white"
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

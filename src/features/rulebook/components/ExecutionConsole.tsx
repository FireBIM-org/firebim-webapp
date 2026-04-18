import { Bars3Icon } from '@heroicons/react/24/outline';
import { useMemo, useState } from 'react';
import { useRuleBookStore, type RuleBookStore } from '../store';

function localNameFromToken(token: string | null | undefined) {
  if (!token) return null;

  if (token.includes('#')) {
    return token.split('#').pop() ?? token;
  }

  if (token.includes(':') && !token.startsWith('http')) {
    return token.split(':').pop() ?? token;
  }

  const parts = token.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? token;
}

type CompatibilityFoundItem = { value: string; count?: number | null };
type CompatibilitySummaryItem = { raw: string; label: string };
type CompatibilitySummaryRequiredItem = CompatibilitySummaryItem & {
  found_count: number;
};

function dedupeByRaw<T extends { raw: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item: T) => {
    if (seen.has(item.raw)) {
      return false;
    }
    seen.add(item.raw);
    return true;
  });
}

export function ExecutionConsole() {
  const execution_timeline = useRuleBookStore(
    (state: RuleBookStore) => state.execution_timeline
  );
  const current_step_index = useRuleBookStore(
    (state: RuleBookStore) => state.current_step_index
  );
  const [collapsed, setCollapsed] = useState(false);

  const current_step = useMemo(() => {
    if (!execution_timeline) return null;
    return execution_timeline.steps[current_step_index] ?? null;
  }, [execution_timeline, current_step_index]);

  const raw_json = useMemo(() => {
    if (!current_step?.raw_json) return null;

    try {
      return JSON.stringify(current_step.raw_json, null, 2);
    } catch {
      return null;
    }
  }, [current_step]);

  const compatibilitySummary = useMemo(() => {
    const raw = (current_step?.raw_json ?? null) as
      | {
          compatibility?: {
            missing_target_classes?: string[];
            target_classes_required?: string[];
            target_classes_found?: Array<{ value: string; count?: number | null }>;
            missing_properties?: string[];
          } | null;
          diagnostic_run?: {
            compatibility?: {
              missing_target_classes?: string[];
              target_classes_required?: string[];
              target_classes_found?: Array<{ value: string; count?: number | null }>;
              missing_properties?: string[];
            } | null;
          };
        }
      | null;

    const compatibility = raw?.compatibility ?? raw?.diagnostic_run?.compatibility ?? null;
    if (!compatibility) {
      return null;
    }

    const foundCounts = new Map(
      (compatibility.target_classes_found ?? []).map(
        (item: CompatibilityFoundItem) => [
        item.value,
        item.count ?? 0,
      ])
    );

    return {
      missing_target_classes: dedupeByRaw(
        (compatibility.missing_target_classes ?? []).map((value: string) => ({
          raw: value,
          label: localNameFromToken(value) ?? value,
        }))
      ),
      target_classes_required: dedupeByRaw(
        (compatibility.target_classes_required ?? []).map((value: string) => ({
          raw: value,
          label: localNameFromToken(value) ?? value,
          found_count: foundCounts.get(value) ?? 0,
        }))
      ),
      missing_properties: dedupeByRaw(
        (compatibility.missing_properties ?? []).map((value: string) => ({
          raw: value,
          label: localNameFromToken(value) ?? value,
        }))
      ),
    };
  }, [current_step]);

  if (collapsed) {
    return (
      <div className="border-t border-gray-200 bg-slate-950 px-4 py-2 text-slate-100">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Execution console
          </div>
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-900 hover:text-slate-200"
            title="Expand execution console"
          >
            <Bars3Icon className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-gray-200 bg-slate-950 px-4 py-3 text-slate-100">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Execution console
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="rounded-md p-1 text-slate-400 hover:bg-slate-900 hover:text-slate-200"
          title="Collapse execution console"
        >
          <Bars3Icon className="h-4 w-4" />
        </button>
      </div>

      {!current_step ? (
        <div className="text-sm text-slate-400">
          No execution output yet. Load a stored building graph and run the backend check.
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-sm text-slate-300">
            <span className="font-semibold text-white">{current_step.rule_id}</span>
            {current_step.target_class ? ` · target_class: ${current_step.target_class}` : ''}
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
            <div className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
              True: {current_step.summary.true_count}
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
              False: {current_step.summary.false_count}
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
              Unknown: {current_step.summary.unknown_count}
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
              Affected: {current_step.summary.affected_node_count}
            </div>
          </div>

          <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-800 bg-slate-900 px-3 py-3">
            {current_step.console_lines.length === 0 ? (
              <div className="text-sm text-slate-400">No console output.</div>
            ) : (
              <div className="space-y-1">
                {current_step.console_lines.map((line: string, index: number) => (
                  <div
                    key={`${current_step.rule_id}-${index}`}
                    className="font-mono text-xs text-emerald-300"
                  >
                    {line}
                  </div>
                ))}
              </div>
            )}
          </div>

          {compatibilitySummary &&
          (compatibilitySummary.missing_target_classes.length > 0 ||
            compatibilitySummary.missing_properties.length > 0) ? (
            <div className="rounded-xl border border-amber-800/60 bg-amber-950/30 px-3 py-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-300">
                Missing targets explained
              </div>

              {compatibilitySummary.missing_target_classes.length > 0 ? (
                <div className="space-y-2 text-xs text-amber-100">
                  {compatibilitySummary.missing_target_classes.map(
                    (item: CompatibilitySummaryItem) => (
                    <div
                      key={item.raw}
                      className="rounded-lg border border-amber-900/60 bg-slate-950/40 px-3 py-2"
                    >
                      The rule expects the target class{' '}
                      <span className="font-semibold text-white">{item.label}</span>, but the
                      compatibility check found no instances of it in the selected graph.
                      <div className="mt-1 font-mono text-[11px] text-amber-300">
                        {item.raw}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {compatibilitySummary.target_classes_required.length > 0 ? (
                <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900 px-3 py-3">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Target overview
                  </div>
                  <div className="space-y-1 text-xs text-slate-200">
                    {compatibilitySummary.target_classes_required.map(
                      (item: CompatibilitySummaryRequiredItem) => (
                      <div key={item.raw}>
                        <span className="font-semibold text-white">{item.label}</span>
                        <span className="text-slate-400"> ({item.raw})</span>
                        {': '}
                        {item.found_count > 0
                          ? `${item.found_count} found in the graph`
                          : 'not found in the graph'}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {compatibilitySummary.missing_properties.length > 0 ? (
                <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900 px-3 py-3">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Missing properties
                  </div>
                  <div className="space-y-1 text-xs text-slate-200">
                    {compatibilitySummary.missing_properties.map(
                      (item: CompatibilitySummaryItem) => (
                      <div key={item.raw}>
                        The property <span className="font-semibold text-white">{item.label}</span>{' '}
                        is missing in the graph for at least one of the target classes required by
                        the rule.
                        <div className="mt-1 font-mono text-[11px] text-slate-400">{item.raw}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {raw_json ? (
            <details className="rounded-xl border border-slate-800 bg-slate-900">
              <summary className="cursor-pointer px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
                Raw backend JSON
              </summary>
              <pre className="max-h-[240px] overflow-auto border-t border-slate-800 px-3 py-3 text-xs text-slate-200">
                {raw_json}
              </pre>
            </details>
          ) : null}
        </div>
      )}
    </div>
  );
}

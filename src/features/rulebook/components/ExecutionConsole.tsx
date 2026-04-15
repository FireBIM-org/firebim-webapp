import { Bars3Icon } from '@heroicons/react/24/outline';
import { useMemo, useState } from 'react';
import { useRuleBookStore } from '../store';

export function ExecutionConsole() {
  const execution_timeline = useRuleBookStore((state) => state.execution_timeline);
  const current_step_index = useRuleBookStore((state) => state.current_step_index);
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
                {current_step.console_lines.map((line, index) => (
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

import { useMemo } from 'react';
import {
  ArrowPathIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PauseIcon,
  PlayIcon,
} from '@heroicons/react/24/outline';
import { useRuleBookStore, type RuleBookStore } from '../store';

type Props = {
  onRun?: () => void;
  overlay?: boolean;
  showSolver?: boolean;
};

const SOLVER_OPTIONS: Array<{
  value: 'standard' | 'horizontal' | 'vertical';
  label: string;
}> = [
  { value: 'standard', label: 'Standard' },
  { value: 'horizontal', label: 'Horizontal' },
  { value: 'vertical', label: 'Vertical' },
];

export function ExecutionControls({
  onRun,
  overlay = false,
  showSolver = true,
}: Props) {
  const execution_status = useRuleBookStore(
    (state: RuleBookStore) => state.execution_status
  );
  const execution_solver = useRuleBookStore(
    (state: RuleBookStore) => state.execution_solver
  );
  const execution_timeline = useRuleBookStore(
    (state: RuleBookStore) => state.execution_timeline
  );
  const current_step_index = useRuleBookStore(
    (state: RuleBookStore) => state.current_step_index
  );
  const runner_rule_items = useRuleBookStore(
    (state: RuleBookStore) => state.runner_rule_items
  );
  const graph_loaded = useRuleBookStore((state: RuleBookStore) => state.graph_loaded);
  const rules_loading = useRuleBookStore((state: RuleBookStore) => state.rules_loading);

  const setExecutionStatus = useRuleBookStore(
    (state: RuleBookStore) => state.setExecutionStatus
  );
  const setExecutionSolver = useRuleBookStore(
    (state: RuleBookStore) => state.setExecutionSolver
  );
  const setCurrentStepIndex = useRuleBookStore(
    (state: RuleBookStore) => state.setCurrentStepIndex
  );
  const setExecutionPlaybackMs = useRuleBookStore(
    (state: RuleBookStore) => state.setExecutionPlaybackMs
  );
  const resetExecution = useRuleBookStore((state: RuleBookStore) => state.resetExecution);

  const step_count = execution_timeline?.steps.length ?? 0;

  const current_step = useMemo(() => {
    if (!execution_timeline) return null;
    return execution_timeline.steps[current_step_index] ?? null;
  }, [execution_timeline, current_step_index]);

  const handleBack = () => {
    if (current_step_index <= 0) return;
    setCurrentStepIndex(current_step_index - 1);
    setExecutionStatus('paused');
  };

  const handleForward = () => {
    if (!execution_timeline) return;
    if (current_step_index >= execution_timeline.steps.length - 1) {
      setExecutionStatus('complete');
      return;
    }

    const nextIndex = current_step_index + 1;
    setCurrentStepIndex(nextIndex);

    if (nextIndex >= execution_timeline.steps.length - 1) {
      setExecutionStatus('complete');
    } else {
      setExecutionStatus('paused');
    }
  };

  const handleTogglePlayPause = () => {
    if (!execution_timeline || execution_timeline.steps.length === 0) return;

    if (execution_status === 'running') {
      setExecutionStatus('paused');
      return;
    }

    if (execution_status === 'complete') {
      setCurrentStepIndex(0);
    }

    setExecutionPlaybackMs(900);
    setExecutionStatus('running');
  };

  const canRun = graph_loaded && runner_rule_items.length > 0 && !rules_loading;
  const wrapperClass = overlay
    ? 'rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur'
    : 'border-t border-gray-200 bg-white px-4 py-3';

  return (
    <div className={wrapperClass}>
      <div className="flex flex-wrap items-center gap-2">
        {showSolver && (
          <div className="inline-flex items-center overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm">
            {SOLVER_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setExecutionSolver(option.value)}
                className={[
                  'px-3 py-2 text-xs font-medium transition',
                  execution_solver === option.value
                    ? 'bg-sky-600 text-white'
                    : 'text-gray-700 hover:bg-gray-50',
                ].join(' ')}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}

        {onRun && (
          <button
            type="button"
            onClick={onRun}
            disabled={!canRun}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <PlayIcon className="h-4 w-4" />
            {rules_loading ? 'Running...' : 'Run'}
          </button>
        )}

        <button
          type="button"
          onClick={handleBack}
          disabled={!execution_timeline || current_step_index <= 0}
          className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={handleTogglePlayPause}
          disabled={!execution_timeline || step_count === 0}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {execution_status === 'running' ? (
            <PauseIcon className="h-4 w-4" />
          ) : (
            <PlayIcon className="h-4 w-4" />
          )}
          {execution_status === 'running' ? 'Pause' : 'Play'}
        </button>

        <button
          type="button"
          onClick={handleForward}
          disabled={
            !execution_timeline ||
            step_count === 0 ||
            current_step_index >= step_count - 1
          }
          className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={resetExecution}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-700 shadow-sm transition hover:bg-gray-50"
        >
          <ArrowPathIcon className="h-4 w-4" />
          Reset
        </button>

        <div className="ml-auto text-xs text-gray-500">
          {current_step
            ? `Step ${current_step_index + 1} / ${step_count} · ${current_step.rule_id} · ${current_step.solver ?? execution_solver}`
            : 'No execution timeline yet'}
        </div>
      </div>

      <div className="mt-3">
        <input
          type="range"
          min={0}
          max={Math.max(step_count - 1, 0)}
          value={Math.min(current_step_index, Math.max(step_count - 1, 0))}
          onChange={(event) => {
            setCurrentStepIndex(Number(event.target.value));
            setExecutionStatus('paused');
          }}
          disabled={!execution_timeline || step_count === 0}
          className="w-full"
        />
      </div>
    </div>
  );
}


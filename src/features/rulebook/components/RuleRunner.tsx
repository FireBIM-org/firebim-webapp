import { ArrowPathIcon, PlayIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useMemo, useRef, useState } from 'react';

import type { RuleRunnerItem } from '../types';

import { useRuleBookStore, type RuleBookStore } from '../store';

type DragPayload = {
  kind: 'rulebook-rule' | 'rulebook-runner-item';
  rule_id?: string;
  label?: string;
  graph_uri?: string | null;
  source?: 'api' | 'example';
  runner_item_id?: string;
  from_index?: number;
};

type Props = {
  onRun?: () => void;
};

function parseDragPayload(event: React.DragEvent): DragPayload | null {
  const value =
    event.dataTransfer.getData('application/firebim-rulebook-runner-item') ||
    event.dataTransfer.getData('application/firebim-rulebook-rule');

  if (!value) return null;

  try {
    return JSON.parse(value) as DragPayload;
  } catch {
    return null;
  }
}

function RuleRunnerPill({
  item,
  index,
  onRemove,
}: {
  item: RuleRunnerItem;
  index: number;
  onRemove: (runner_item_id: string) => void;
}) {
  const handleDragStart = (event: React.DragEvent<HTMLDivElement>) => {
    const payload: DragPayload = {
      kind: 'rulebook-runner-item',
      runner_item_id: item.runner_item_id,
      rule_id: item.rule_id,
      label: item.label,
      graph_uri: item.graph_uri ?? null,
      from_index: index,
    };

    event.dataTransfer.setData('application/firebim-rulebook-runner-item', JSON.stringify(payload));
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className="group inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-sky-200 bg-white px-3 text-xs shadow-sm transition hover:border-sky-300 hover:shadow-md"
    >
      <div className="text-[10px] font-semibold tracking-wide text-sky-700 uppercase">Rule</div>

      <div className="max-w-[180px] truncate font-medium text-gray-900">{item.label}</div>

      <button
        type="button"
        onClick={() => onRemove(item.runner_item_id)}
        className="rounded-full p-1 text-gray-400 transition hover:bg-red-50 hover:text-red-600"
        title="Remove from Rule Runner"
      >
        <TrashIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

export function RuleRunner({ onRun }: Props) {
  const runner_rule_items = useRuleBookStore((state: RuleBookStore) => state.runner_rule_items);
  const available_rules = useRuleBookStore((state: RuleBookStore) => state.available_rules);
  const active_graph_data = useRuleBookStore((state: RuleBookStore) => state.active_graph_data);
  const graph_loaded = useRuleBookStore((state: RuleBookStore) => state.graph_loaded);
  const execution_solver = useRuleBookStore((state: RuleBookStore) => state.execution_solver);
  const rules_loading = useRuleBookStore((state: RuleBookStore) => state.rules_loading);

  const addRuleToRunner = useRuleBookStore((state: RuleBookStore) => state.addRuleToRunner);
  const removeRuleFromRunner = useRuleBookStore(
    (state: RuleBookStore) => state.removeRuleFromRunner,
  );
  const moveRunnerItem = useRuleBookStore((state: RuleBookStore) => state.moveRunnerItem);
  const clearRunner = useRuleBookStore((state: RuleBookStore) => state.clearRunner);
  const resetExecution = useRuleBookStore((state: RuleBookStore) => state.resetExecution);

  const [is_drag_over, setIsDragOver] = useState(false);
  const [dragging_runner_item_id, setDraggingRunnerItemId] = useState<string | null>(null);

  const runner_ref = useRef<HTMLDivElement | null>(null);

  const runner_rule_ids = useMemo(
    () => runner_rule_items.map((item: RuleRunnerItem) => item.rule_id),
    [runner_rule_items],
  );

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);

    const payload = parseDragPayload(event);
    if (!payload) return;

    if (payload.kind === 'rulebook-rule' && payload.rule_id) {
      const rule = available_rules.find(
        (item: RuleRunnerItem | { rule_id: string }) => item.rule_id === payload.rule_id,
      );
      if (!rule) return;

      addRuleToRunner(rule);
      return;
    }

    if (payload.kind === 'rulebook-runner-item' && typeof payload.from_index === 'number') {
      const target = event.target as HTMLElement | null;
      const target_pill = target?.closest('[data-runner-index]');
      const to_index_attr = target_pill?.getAttribute('data-runner-index');

      if (to_index_attr == null) {
        return;
      }

      const to_index = Number(to_index_attr);

      if (!Number.isNaN(to_index)) {
        moveRunnerItem(payload.from_index, to_index);
      }
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    if (!runner_ref.current) {
      setIsDragOver(false);
      return;
    }

    const next_target = event.relatedTarget as Node | null;
    if (!next_target || !runner_ref.current.contains(next_target)) {
      setIsDragOver(false);
    }
  };

  const handleRunnerItemDragStart = (runner_item_id: string) => {
    setDraggingRunnerItemId(runner_item_id);
  };

  const handleRunnerItemDragEnd = (event: React.DragEvent<HTMLDivElement>) => {
    const payload = parseDragPayload(event);

    if (
      payload?.kind === 'rulebook-runner-item' &&
      payload.runner_item_id &&
      event.dataTransfer.dropEffect === 'none'
    ) {
      removeRuleFromRunner(payload.runner_item_id);
    }

    setDraggingRunnerItemId(null);
    setIsDragOver(false);
  };

  const can_run = graph_loaded && runner_rule_items.length > 0 && !rules_loading;

  return (
    <div className="border-b border-gray-200 bg-slate-50 px-4 py-2">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onRun}
          disabled={!can_run}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <PlayIcon className="h-4 w-4" />
          {rules_loading ? 'Running...' : 'Run diagnostic checks'}
        </button>

        <button
          type="button"
          onClick={resetExecution}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 shadow-sm transition hover:bg-gray-50"
        >
          <ArrowPathIcon className="h-4 w-4" />
          Reset
        </button>

        <button
          type="button"
          onClick={clearRunner}
          disabled={runner_rule_items.length === 0}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <TrashIcon className="h-4 w-4" />
          Clear runner
        </button>

        <div className="ml-auto text-xs text-gray-500">
          {graph_loaded
            ? `Loaded graph: ${active_graph_data?.label ?? active_graph_data?.id ?? 'unknown'} · ${runner_rule_ids.length} rule(s) · solver=${execution_solver}`
            : 'Load a building graph first'}
        </div>
      </div>

      <div
        ref={runner_ref}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={[
          'relative overflow-x-auto rounded-2xl border bg-white px-3 py-2.5 transition-all',
          is_drag_over
            ? 'border-sky-400 shadow-[0_0_0_3px_rgba(56,189,248,0.20),0_0_24px_rgba(56,189,248,0.30)]'
            : 'border-white/10 shadow-sm',
        ].join(' ')}
      >
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
            Rule Runner
          </div>

          <div className="text-[11px] text-gray-400">Drag Rules here</div>
        </div>

        {runner_rule_items.length === 0 ? (
          <div className="flex min-h-[40px] items-center justify-center rounded-xl border border-dashed border-gray-200 bg-slate-50 px-4 text-xs text-gray-400">
            Drop rules here to build the execution sequence
          </div>
        ) : (
          <div className="flex min-h-[40px] min-w-max items-center gap-2">
            {runner_rule_items.map((item: RuleRunnerItem, index: number) => (
              <div
                key={item.runner_item_id}
                data-runner-index={index}
                onDragStart={() => handleRunnerItemDragStart(item.runner_item_id)}
                onDragEnd={handleRunnerItemDragEnd}
                className={dragging_runner_item_id === item.runner_item_id ? 'opacity-80' : ''}
              >
                <RuleRunnerPill item={item} index={index} onRemove={removeRuleFromRunner} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

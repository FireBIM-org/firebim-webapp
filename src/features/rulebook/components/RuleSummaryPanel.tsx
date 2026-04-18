import { Bars3Icon } from '@heroicons/react/24/outline';
import { useEffect, useMemo, useState } from 'react';
import { getRuleOrNull, runCompatibilityCheck } from '../api';
import { useRuleBookStore } from '../store';
import type {
  CheckCompatibilityResponse,
  CheckRunResponse,
  RuleDefinition,
} from '../types';

type StepRawJson = {
  check_run?: CheckRunResponse;
  compatibility?: CheckCompatibilityResponse | null;
};

type TimelineRawResult = {
  runs?: StepRawJson[];
};

type RuleStructureStats = {
  ruleId: string;
  label: string;
  targetClasses: string[];
  decisionCount: number;
  terminalPathCount: number;
  passPathCount: number;
  minDecisionStepsToPass: number | null;
  maxDecisionStepsToPass: number | null;
};

function formatTargetClass(value: string) {
  if (value.includes('#')) {
    return value.split('#').pop() || value;
  }
  if (value.includes('/')) {
    return value.split('/').pop() || value;
  }
  if (value.includes(':')) {
    return value.split(':').pop() || value;
  }
  return value;
}

function branchTargetsForElement(element: RuleDefinition['rule_elements'][number]) {
  const targets: string[] = [];

  if (typeof element.true_path === 'string' && element.true_path) {
    targets.push(element.true_path);
  }
  if (typeof element.false_path === 'string' && element.false_path) {
    targets.push(element.false_path);
  }
  if (typeof element.unknown_path === 'string' && element.unknown_path) {
    targets.push(element.unknown_path);
  }

  return Array.from(new Set(targets));
}

function isPassingEndNode(element: RuleDefinition['rule_elements'][number]) {
  const candidates = [
    element.label,
    typeof element.value === 'string' ? element.value : null,
    typeof element.config?.terminal_value === 'string'
      ? (element.config.terminal_value as string)
      : null,
    typeof element.config?.end_kind === 'string'
      ? (element.config.end_kind as string)
      : null,
    typeof element.config?.output_text === 'string'
      ? (element.config.output_text as string)
      : null,
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase());

  return candidates.some(
    (value) =>
      value.includes('pass') || value.includes('success') || value === 'true'
  );
}

function computeRuleStructureStats(definition: RuleDefinition, fallbackLabel: string): RuleStructureStats {
  const ruleElements = Array.isArray(definition.rule_elements)
    ? definition.rule_elements
    : [];
  const elementById = new Map(ruleElements.map((element) => [element.id, element]));
  const targetClasses = Array.from(
    new Set(
      ruleElements
        .filter((element) => element.element_type === 'decision')
        .map((element) => element.target_class)
        .filter((value): value is string => Boolean(value))
        .map(formatTargetClass)
    )
  );
  const decisionCount = ruleElements.filter(
    (element) => element.element_type === 'decision'
  ).length;

  const visited = new Set<string>();
  const pathStats: Array<{ isPass: boolean; decisionCount: number }> = [];

  function walk(nodeId: string | null | undefined, decisionSteps: number, trail: Set<string>) {
    if (!nodeId || trail.has(nodeId)) {
      return;
    }

    const element = elementById.get(nodeId);
    if (!element) {
      return;
    }

    const nextTrail = new Set(trail);
    nextTrail.add(nodeId);

    const nextDecisionSteps =
      element.element_type === 'decision' ? decisionSteps + 1 : decisionSteps;

    if (element.element_type === 'end') {
      pathStats.push({
        isPass: isPassingEndNode(element),
        decisionCount: nextDecisionSteps,
      });
      return;
    }

    const branchTargets = branchTargetsForElement(element);
    if (branchTargets.length === 0) {
      return;
    }

    for (const target of branchTargets) {
      walk(target, nextDecisionSteps, nextTrail);
    }
  }

  walk(definition.entry, 0, visited);

  const passPaths = pathStats.filter((path) => path.isPass);
  const minDecisionStepsToPass =
    passPaths.length > 0
      ? Math.min(...passPaths.map((path) => path.decisionCount))
      : null;
  const maxDecisionStepsToPass =
    passPaths.length > 0
      ? Math.max(...passPaths.map((path) => path.decisionCount))
      : null;

  const startElement = ruleElements.find(
    (element) => element.element_type === 'start'
  );

  return {
    ruleId: definition.id,
    label: startElement?.label || fallbackLabel,
    targetClasses,
    decisionCount,
    terminalPathCount: pathStats.length,
    passPathCount: passPaths.length,
    minDecisionStepsToPass,
    maxDecisionStepsToPass,
  };
}

export function RuleSummaryPanel() {
  const active_graph_data = useRuleBookStore((state) => state.active_graph_data);
  const graph_loaded = useRuleBookStore((state) => state.graph_loaded);
  const runner_rule_items = useRuleBookStore((state) => state.runner_rule_items);
  const available_rules = useRuleBookStore((state) => state.available_rules);
  const execution_timeline = useRuleBookStore((state) => state.execution_timeline);
  const current_step_index = useRuleBookStore((state) => state.current_step_index);
  const [collapsed, setCollapsed] = useState(false);
  const [liveCompatibilities, setLiveCompatibilities] = useState<
    CheckCompatibilityResponse[]
  >([]);
  const [liveCompatibilityLoading, setLiveCompatibilityLoading] = useState(false);
  const [ruleStructureStats, setRuleStructureStats] = useState<RuleStructureStats[]>([]);
  const [ruleStructureLoading, setRuleStructureLoading] = useState(false);

  const current_step = useMemo(() => {
    if (!execution_timeline) return null;
    return execution_timeline.steps[current_step_index] ?? null;
  }, [execution_timeline, current_step_index]);

  const step_payload = (current_step?.raw_json ?? null) as StepRawJson | null;
  const compatibility = step_payload?.compatibility ?? null;
  const timeline_runs = useMemo(() => {
    const raw_result = (execution_timeline?.raw_result ?? null) as TimelineRawResult | null;
    return Array.isArray(raw_result?.runs) ? raw_result.runs : [];
  }, [execution_timeline]);
  const compatibilityRefreshKey = useMemo(() => {
    const graphId = active_graph_data?.id ?? 'no-graph';
    const runnerKey = runner_rule_items.map((item) => item.rule_id).join('|') || 'no-rules';
    return `${graphId}:${runnerKey}`;
  }, [active_graph_data?.id, runner_rule_items]);

  useEffect(() => {
    let cancelled = false;

    async function loadRuleStructures() {
      if (runner_rule_items.length === 0) {
        setRuleStructureStats([]);
        setRuleStructureLoading(false);
        return;
      }

      setRuleStructureLoading(true);

      try {
        const stats = await Promise.all(
          runner_rule_items.map(async (runnerItem) => {
            const matchingRule = available_rules.find(
              (item) => item.rule_id === runnerItem.rule_id
            );
            const definition = await getRuleOrNull(runnerItem.rule_id);
            if (!definition) {
              return null;
            }
            return computeRuleStructureStats(
              definition,
              matchingRule?.label ?? runnerItem.label
            );
          })
        );

        if (cancelled) return;

        setRuleStructureStats(
          stats.filter((item): item is RuleStructureStats => Boolean(item))
        );
      } finally {
        if (!cancelled) {
          setRuleStructureLoading(false);
        }
      }
    }

    void loadRuleStructures();

    return () => {
      cancelled = true;
    };
  }, [available_rules, runner_rule_items]);

  useEffect(() => {
    if (!graph_loaded || !active_graph_data || active_graph_data.source !== 'api') {
      setLiveCompatibilities([]);
      setLiveCompatibilityLoading(false);
      return;
    }

    if (runner_rule_items.length === 0) {
      setLiveCompatibilities([]);
      setLiveCompatibilityLoading(false);
      return;
    }

    let cancelled = false;

    async function loadLiveCompatibilities() {
      const graphId = active_graph_data?.id;
      if (!graphId) {
        setLiveCompatibilities([]);
        setLiveCompatibilityLoading(false);
        return;
      }

      setLiveCompatibilityLoading(true);

      try {
        const results = await Promise.all(
          runner_rule_items.map(async (runnerItem) => {
            try {
              return await runCompatibilityCheck({
                rule_id: runnerItem.rule_id,
                graph_id: graphId,
              });
            } catch {
              return null;
            }
          })
        );

        if (cancelled) return;

        setLiveCompatibilities(
          results.filter(
            (result): result is CheckCompatibilityResponse => Boolean(result)
          )
        );
      } finally {
        if (!cancelled) {
          setLiveCompatibilityLoading(false);
        }
      }
    }

    void loadLiveCompatibilities();

    return () => {
      cancelled = true;
    };
  }, [
    active_graph_data,
    graph_loaded,
    runner_rule_items,
    compatibilityRefreshKey,
  ]);

  const runnerRuleClasses = useMemo(() => {
    const values = new Set<string>();

    for (const stats of ruleStructureStats) {
      for (const targetClass of stats.targetClasses) {
        values.add(targetClass);
      }
    }

    for (const runnerItem of runner_rule_items) {
      const matchingRule = available_rules.find(
        (item) => item.rule_id === runnerItem.rule_id
      );

      for (const targetClass of matchingRule?.target_classes ?? []) {
        if (typeof targetClass === 'string' && targetClass) {
          values.add(formatTargetClass(targetClass));
        }
      }
    }

    return values;
  }, [available_rules, ruleStructureStats, runner_rule_items]);

  const compatibilityTargetClassRows = useMemo(() => {
    const ruleClasses = new Set<string>(runnerRuleClasses);
    const graphClasses = new Set<string>();

    const compatibilitySources =
      liveCompatibilities.length > 0
        ? liveCompatibilities
        : timeline_runs
            .map((run) => run.compatibility)
            .filter(
              (runCompatibility): runCompatibility is CheckCompatibilityResponse =>
                Boolean(runCompatibility)
            );

    for (const runCompatibility of compatibilitySources) {
      for (const value of runCompatibility.target_classes_required ?? []) {
        if (typeof value === 'string' && value) {
          ruleClasses.add(formatTargetClass(value));
        }
      }

      for (const match of runCompatibility.target_classes_found ?? []) {
        if (typeof match.value === 'string' && match.value) {
          graphClasses.add(formatTargetClass(match.value));
        }
      }

      for (const match of runCompatibility.graph_classes_unused_by_rule ?? []) {
        if (typeof match.value === 'string' && match.value) {
          graphClasses.add(formatTargetClass(match.value));
        }
      }
    }

    return Array.from(new Set([...ruleClasses, ...graphClasses]))
      .sort((a, b) => a.localeCompare(b))
      .map((className) => ({
        key: className,
        ruleValue: ruleClasses.has(className) ? className : '',
        graphValue: graphClasses.has(className) ? className : '',
      }));
  }, [liveCompatibilities, runnerRuleClasses, timeline_runs]);

  if (collapsed) {
    return (
      <aside className="flex w-10 flex-col items-center border-l border-gray-200 bg-white py-2">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          title="Expand summary"
        >
          <Bars3Icon className="h-5 w-5" />
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex w-80 flex-col border-l border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="rule-workspace-header">Summary</div>
            <div className="text-xs text-gray-500">
              Overview of loaded graph, rule structure, runner compatibility, and matching classes
            </div>
          </div>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            title="Collapse summary"
          >
            <Bars3Icon className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <section className="rounded-xl border border-gray-200 bg-slate-50 p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Building graph
          </div>

          {graph_loaded && active_graph_data ? (
            <div className="space-y-3 text-sm text-gray-700">
              <div className="flex flex-wrap items-baseline gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Name:
                </span>
                <span className="font-medium text-gray-900">{active_graph_data.label}</span>
              </div>

              <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                <div className="grid grid-cols-3 border-b border-gray-200 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                  <div className="px-3 py-2 text-center">Nodes</div>
                  <div className="border-l border-gray-200 px-3 py-2 text-center">Edges</div>
                  <div className="border-l border-gray-200 px-3 py-2 text-center">Triples</div>
                </div>
                <div className="grid grid-cols-3 text-sm font-medium text-gray-900">
                  <div className="px-3 py-2 text-center">{active_graph_data.nodes.length}</div>
                  <div className="border-l border-gray-200 px-3 py-2 text-center">
                    {active_graph_data.edges.length}
                  </div>
                  <div className="border-l border-gray-200 px-3 py-2 text-center">
                    {active_graph_data.triple_count ?? 'n/a'}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-400">No building graph loaded</div>
          )}
        </section>

        <section className="rounded-xl border border-gray-200 bg-slate-50 p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Rule runner
          </div>

          {runner_rule_items.length > 0 ? (
            <div className="space-y-2">
              {runner_rule_items.map((item, index) => (
                <div
                  key={item.runner_item_id}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                >
                  <span className="mr-2 text-xs text-gray-400">{index + 1}.</span>
                  {item.label}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-400">No rules in the Rule Runner</div>
          )}
        </section>

        <section className="rounded-xl border border-gray-200 bg-slate-50 p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Compatibility
          </div>

          {!compatibility ? (
            <div className="space-y-1 text-sm text-gray-400">
              <div>No compatibility result yet</div>
              <div>Run the Rule Runner to see compatibility details</div>
            </div>
          ) : (
            <div className="space-y-2 text-sm text-gray-700">
              <div>Score: {compatibility.compatibility_score}</div>
              <div>
                Missing target classes: {compatibility.missing_target_classes?.length ?? 0}
              </div>
              <div>Missing properties: {compatibility.missing_properties?.length ?? 0}</div>
              <div>Found target classes: {compatibility.target_classes_found?.length ?? 0}</div>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-gray-200 bg-slate-50 p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Matching classes
          </div>

          {liveCompatibilityLoading && compatibilityTargetClassRows.length === 0 ? (
            <div className="text-sm text-gray-400">Updating matching classes...</div>
          ) : compatibilityTargetClassRows.length === 0 ? (
            <div className="text-sm text-gray-400">
              Add rules to the Rule Runner to compare classes
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
              <div className="grid grid-cols-2 border-b border-gray-200 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                <div className="px-3 py-2">Rule(s)</div>
                <div className="border-l border-gray-200 px-3 py-2">Graph</div>
              </div>
              {compatibilityTargetClassRows.map((row) => (
                <div
                  key={row.key}
                  className="grid grid-cols-2 border-t border-gray-100 text-sm text-gray-700 first:border-t-0"
                >
                  <div className="min-h-9 px-3 py-2">{row.ruleValue}</div>
                  <div className="min-h-9 border-l border-gray-200 px-3 py-2">
                    {row.graphValue}
                  </div>
                </div>
              ))}
            </div>
          )}

        <section className="rounded-xl border border-gray-200 bg-slate-50 p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Rule structure
          </div>

          {ruleStructureLoading && ruleStructureStats.length === 0 ? (
            <div className="text-sm text-gray-400">Loading rule structure stats...</div>
          ) : ruleStructureStats.length === 0 ? (
            <div className="text-sm text-gray-400">Add rules to the Rule Runner to inspect structure</div>
          ) : (
            <div className="space-y-3">
              {ruleStructureStats.map((stats) => (
                <div
                  key={stats.ruleId}
                  className="rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-700"
                >
                  <div className="font-medium text-gray-900">{stats.label}</div>
                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                    <div>
                      <div className="uppercase tracking-wide text-gray-500">Target</div>
                      <div className="mt-1 text-sm text-gray-800">
                        {stats.targetClasses.length > 0 ? stats.targetClasses.join(', ') : 'n/a'}
                      </div>
                    </div>
                    <div>
                      <div className="uppercase tracking-wide text-gray-500">Decision elements</div>
                      <div className="mt-1 text-sm text-gray-800">{stats.decisionCount}</div>
                    </div>
                    <div>
                      <div className="uppercase tracking-wide text-gray-500">Terminal paths</div>
                      <div className="mt-1 text-sm text-gray-800">{stats.terminalPathCount}</div>
                    </div>
                    <div>
                      <div className="uppercase tracking-wide text-gray-500">Pass paths</div>
                      <div className="mt-1 text-sm text-gray-800">{stats.passPathCount}</div>
                    </div>
                    <div>
                      <div className="uppercase tracking-wide text-gray-500">Min decisions to pass</div>
                      <div className="mt-1 text-sm text-gray-800">
                        {stats.minDecisionStepsToPass ?? 'n/a'}
                      </div>
                    </div>
                    <div>
                      <div className="uppercase tracking-wide text-gray-500">Max decisions to pass</div>
                      <div className="mt-1 text-sm text-gray-800">
                        {stats.maxDecisionStepsToPass ?? 'n/a'}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        </section>
      </div>
    </aside>
  );
}

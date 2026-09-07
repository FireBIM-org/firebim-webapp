import { CheckCircleIcon, QuestionMarkCircleIcon } from '@heroicons/react/24/outline';
import { useCallback, useMemo, useState } from 'react';

import type { BuildingGraphData, GraphAssertion, OpenQuestion } from '../types';

import { compactTerm } from '../../rulebuilder/components/RuleElementNode';
import {
  answerBuildingGraph,
  fetchStoredBuildingGraphRaw,
  listStoredBuildingGraphs,
  parseBuildingGraphTtl,
} from '../api';
import { cloneDefaultOntologyCatalog } from '../ontologyCatalog';
import { useRuleBookStore, type RuleBookStore } from '../store';

type Props = {
  /** re-run the Rule Runner (after the answered graph is loaded, or with what-if overrides) */
  onRun: () => void | Promise<void>;
};

const ANSWER_SUFFIX = '--answered';

function localName(iri: string | null | undefined): string {
  if (!iri) return '—';
  const text = String(iri);
  const cut = Math.max(text.lastIndexOf('#'), text.lastIndexOf('/'));
  return cut >= 0 ? text.slice(cut + 1) : text;
}

function questionText(question: OpenQuestion): string {
  const property = compactTerm(question.property_path);
  if (question.node_type === 'derive') {
    return `Value of ${property} (needed by "${question.label ?? question.node_id}")`;
  }
  if (question.reason_code === 'ambiguous_input') {
    return `${question.label ?? property} — the graph has several values; which one applies?`;
  }
  return question.label ? `${question.label} (${property})` : property;
}

function pathHint(question: OpenQuestion): string | null {
  if (!question.write_subject) return null;
  if (question.write_subject === question.target_node) return null;
  return `written on ${localName(question.write_subject)} (reached through ${compactTerm(
    question.property_path.split('/').slice(0, -1).join('/'),
  )})`;
}

/** Coerce a drafted answer to what the API should store, by question kind. */
function toAssertionValue(question: OpenQuestion, draft: unknown): unknown {
  if (draft === undefined || draft === null || draft === '') return undefined;
  if (question.kind === 'boolean') return draft === true || draft === 'true';
  if (question.kind === 'number') {
    const n = typeof draft === 'number' ? draft : Number(String(draft).replace(',', '.'));
    return Number.isFinite(n) ? n : undefined;
  }
  return typeof draft === 'string' ? draft.trim() : draft;
}

export function OpenQuestionsPanel({ onRun }: Props) {
  const ask_user = useRuleBookStore((state: RuleBookStore) => state.ask_user);
  const execution_timeline = useRuleBookStore((state: RuleBookStore) => state.execution_timeline);
  const active_graph_data = useRuleBookStore((state: RuleBookStore) => state.active_graph_data);
  const answer_drafts = useRuleBookStore((state: RuleBookStore) => state.answer_drafts);
  const setAnswerDraft = useRuleBookStore((state: RuleBookStore) => state.setAnswerDraft);
  const clearAnswerDrafts = useRuleBookStore((state: RuleBookStore) => state.clearAnswerDrafts);
  const overrides = useRuleBookStore((state: RuleBookStore) => state.overrides);
  const setOverrides = useRuleBookStore((state: RuleBookStore) => state.setOverrides);
  const setAvailableGraphs = useRuleBookStore((state: RuleBookStore) => state.setAvailableGraphs);
  const setSelectedGraphSource = useRuleBookStore(
    (state: RuleBookStore) => state.setSelectedGraphSource,
  );
  const setActiveGraphData = useRuleBookStore((state: RuleBookStore) => state.setActiveGraphData);
  const setActiveGraphUri = useRuleBookStore((state: RuleBookStore) => state.setActiveGraphUri);
  const setGraphLoaded = useRuleBookStore((state: RuleBookStore) => state.setGraphLoaded);
  const setGraphError = useRuleBookStore((state: RuleBookStore) => state.setGraphError);

  const [busy, setBusy] = useState<'save' | 'whatif' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const questions = useMemo(() => execution_timeline?.questions ?? [], [execution_timeline]);

  const grouped = useMemo(() => {
    const map = new Map<string, OpenQuestion[]>();
    for (const question of questions) {
      const bucket = map.get(question.target_node) ?? [];
      bucket.push(question);
      map.set(question.target_node, bucket);
    }
    return [...map.entries()];
  }, [questions]);

  const assertions = useMemo<GraphAssertion[]>(() => {
    const out: GraphAssertion[] = [];
    for (const question of questions) {
      if (!question.write_subject || !question.write_property) continue;
      const value = toAssertionValue(question, answer_drafts[question.key]);
      if (value === undefined) continue;
      out.push({ subject: question.write_subject, property: question.write_property, value });
    }
    return out;
  }, [answer_drafts, questions]);

  const loadGraph = useCallback(
    async (graph_id: string) => {
      const graphs = await listStoredBuildingGraphs();
      const nextGraphs = graphs.map((graph): BuildingGraphData => ({
        id: graph.graph_id,
        label: graph.label ?? graph.graph_id,
        graph_uri: graph.graph_uri ?? null,
        source: graph.source ?? 'api',
        triple_count: graph.triple_count ?? null,
        ttl: null,
        nodes: [],
        edges: [],
        ontology_catalog: cloneDefaultOntologyCatalog(),
      }));
      setAvailableGraphs(nextGraphs);
      setSelectedGraphSource(graph_id);
      const response = await fetchStoredBuildingGraphRaw(graph_id);
      const graph = parseBuildingGraphTtl(response, cloneDefaultOntologyCatalog());
      setActiveGraphData(graph);
      setActiveGraphUri(graph.graph_uri ?? graph.id);
      setGraphLoaded(true);
      setGraphError(null);
    },
    [
      setActiveGraphData,
      setActiveGraphUri,
      setAvailableGraphs,
      setGraphError,
      setGraphLoaded,
      setSelectedGraphSource,
    ],
  );

  const handleAnswerAndRerun = useCallback(async () => {
    if (!active_graph_data || assertions.length === 0) return;
    setBusy('save');
    setNotice(null);
    try {
      const base_id = active_graph_data.id;
      const result = await answerBuildingGraph({ graph_id: base_id, assertions });
      clearAnswerDrafts();
      setOverrides([]);
      // The Rule Runner keeps its rules; the loaded graph becomes the answered copy and the run is repeated.
      await loadGraph(result.graph_id);
      setNotice(
        `${result.applied} answer${result.applied === 1 ? '' : 's'} written into ${result.graph_id}${
          result.created ? ' (new graph)' : ''
        } — running again…`,
      );
      // let the store settle before the run reads active_graph_data
      window.setTimeout(() => void onRun(), 0);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not write the answers');
    } finally {
      setBusy(null);
    }
  }, [active_graph_data, assertions, clearAnswerDrafts, loadGraph, onRun, setOverrides]);

  const handleWhatIf = useCallback(async () => {
    if (assertions.length === 0) return;
    setBusy('whatif');
    setNotice(null);
    const merged = [
      ...overrides.filter(
        (o) => !assertions.some((a) => a.subject === o.subject && a.property === o.property),
      ),
      ...assertions,
    ];
    setOverrides(merged);
    clearAnswerDrafts();
    setNotice(
      `Running with ${merged.length} what-if fact${merged.length === 1 ? '' : 's'} (nothing saved)…`,
    );
    window.setTimeout(() => void onRun(), 0);
    setBusy(null);
  }, [assertions, clearAnswerDrafts, onRun, overrides, setOverrides]);

  if (!ask_user || !execution_timeline) return null;

  const answered_graph = active_graph_data?.id.endsWith(ANSWER_SUFFIX)
    ? active_graph_data.id
    : `${active_graph_data?.id ?? 'graph'}${ANSWER_SUFFIX}`;

  if (questions.length === 0) {
    return (
      <div className="mx-4 mb-3 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs text-emerald-800">
        <CheckCircleIcon className="h-4 w-4" />
        No open questions — every target reached a definite end.
        {notice ? <span className="ml-2 text-emerald-700">{notice}</span> : null}
      </div>
    );
  }

  return (
    <div className="mx-4 mb-3 rounded-2xl border border-amber-200 bg-amber-50/70 shadow-sm">
      <button
        type="button"
        onClick={() => setCollapsed((value) => !value)}
        className="flex w-full items-center gap-2 px-4 py-2 text-left"
      >
        <QuestionMarkCircleIcon className="h-4 w-4 text-amber-700" />
        <span className="text-xs font-semibold tracking-wide text-amber-900 uppercase">
          Open questions
        </span>
        <span className="text-xs text-amber-800">
          {questions.length} missing fact{questions.length === 1 ? '' : 's'} on {grouped.length}{' '}
          target
          {grouped.length === 1 ? '' : 's'} — answer what you know, then run again
        </span>
        <span className="ml-auto text-[11px] text-amber-700">{collapsed ? 'show' : 'hide'}</span>
      </button>

      {!collapsed && (
        <div className="space-y-3 px-4 pb-3">
          {grouped.map(([target, items]) => (
            <div key={target} className="rounded-xl border border-amber-200 bg-white p-3">
              <div className="mb-2 flex items-baseline gap-2">
                <span className="font-mono text-xs font-semibold text-gray-900">
                  {localName(target)}
                </span>
                <span className="truncate text-[10px] text-gray-400" title={target}>
                  {target}
                </span>
              </div>
              <div className="space-y-2">
                {items.map((question) => (
                  <QuestionRow
                    key={question.key}
                    question={question}
                    draft={answer_drafts[question.key]}
                    onDraft={(value) => setAnswerDraft(question.key, value)}
                  />
                ))}
              </div>
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              disabled={assertions.length === 0 || busy !== null}
              onClick={() => void handleAnswerAndRerun()}
              className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
              title={`Writes the answers into ${answered_graph} (the original graph is never changed), loads that graph and runs the Rule Runner again`}
            >
              {busy === 'save' ? 'Saving…' : `Answer & run again (${assertions.length})`}
            </button>
            <button
              type="button"
              disabled={assertions.length === 0 || busy !== null}
              onClick={() => void handleWhatIf()}
              className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 shadow-sm hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
              title="Runs again with these facts asserted for this run only — nothing is saved"
            >
              What-if (don't save)
            </button>
            <span className="text-[11px] text-amber-800">
              Answers go to <span className="font-mono">{answered_graph}</span>; the source graph
              stays as it is.
            </span>
            {notice ? <span className="ml-auto text-[11px] text-amber-900">{notice}</span> : null}
          </div>
        </div>
      )}
    </div>
  );
}

function QuestionRow({
  question,
  draft,
  onDraft,
}: {
  question: OpenQuestion;
  draft: unknown;
  onDraft: (value: unknown) => void;
}) {
  const [custom, setCustom] = useState(false);
  const disabled = !question.write_subject || !question.write_property;
  const inputClass =
    'rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 shadow-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500 disabled:bg-gray-100';
  const hint = pathHint(question);

  return (
    <div className="grid grid-cols-1 gap-1 md:grid-cols-[minmax(0,1fr)_220px] md:items-center">
      <div className="min-w-0">
        <div className="text-xs text-gray-800">{questionText(question)}</div>
        <div className="text-[10px] text-gray-500">
          asked by <span className="font-medium">{question.rule_label}</span>
          {question.current_value !== undefined && question.current_value !== null ? (
            <>
              {' '}
              · current: <span className="font-mono">{JSON.stringify(question.current_value)}</span>
            </>
          ) : null}
          {hint ? <> · {hint}</> : null}
        </div>
        {disabled && question.problem ? (
          <div className="text-[10px] text-red-700">
            Cannot be answered here: {question.problem}
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-1">
        {question.kind === 'boolean' ? (
          <select
            value={draft === true ? 'true' : draft === false ? 'false' : ''}
            onChange={(event) =>
              onDraft(event.target.value === '' ? undefined : event.target.value === 'true')
            }
            disabled={disabled}
            className={`${inputClass} w-full`}
          >
            <option value="">— choose —</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        ) : question.kind === 'choice' && !custom ? (
          <select
            value={typeof draft === 'string' ? draft : ''}
            onChange={(event) => {
              if (event.target.value === '__other__') {
                setCustom(true);
                onDraft(undefined);
                return;
              }
              onDraft(event.target.value === '' ? undefined : event.target.value);
            }}
            disabled={disabled}
            className={`${inputClass} w-full`}
          >
            <option value="">— choose —</option>
            {question.options.map((option) => (
              <option key={String(option)} value={String(option)}>
                {String(option)}
              </option>
            ))}
            <option value="__other__">other…</option>
          </select>
        ) : question.kind === 'number' ? (
          <input
            type="number"
            step="any"
            value={draft === undefined || draft === null ? '' : String(draft)}
            onChange={(event) =>
              onDraft(event.target.value === '' ? undefined : event.target.value)
            }
            disabled={disabled}
            placeholder={
              question.operator && question.value !== undefined && question.value !== null
                ? `compared ${question.operator} ${JSON.stringify(question.value)}`
                : 'number'
            }
            className={`${inputClass} w-full`}
          />
        ) : (
          <input
            type="text"
            value={typeof draft === 'string' ? draft : ''}
            onChange={(event) =>
              onDraft(event.target.value === '' ? undefined : event.target.value)
            }
            disabled={disabled}
            placeholder="value"
            className={`${inputClass} w-full`}
          />
        )}
      </div>
    </div>
  );
}

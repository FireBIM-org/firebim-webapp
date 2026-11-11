import { Bars3Icon, BookOpenIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { ChangeEvent, useEffect, useState } from 'react';

import type { RuleData } from '@/features/rulebuilder/editorStore';
import type { RuleTermValidationIssue } from '@/utils/api-client';

import {
  searchOntologyLibraryTerms,
  type OntologyLibraryEntry,
  type OntologyTermSuggestion,
} from '@/features/ontologies/library';
import { isValueRef } from '@/features/rulebuilder/components/RuleElementNode';

import RuleLiteralValueEditor from './RuleLiteralValueEditor';

type RuleElementType = RuleData['element_type'];

type Props = {
  selectedRule: RuleData | null;
  onChange: (patch: Partial<RuleData>) => void;
  onBuildTree?: () => void;
  ontologyLibrary: OntologyLibraryEntry[];
  selectedOntologyIds: string[];
  onSelectedOntologyIdsChange: (ids: string[]) => void;
  validationIssues: RuleTermValidationIssue[];
  validationStatus: 'idle' | 'checking' | 'complete' | 'error';
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

function inputValue(value: unknown) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function getEffectiveElementType(rule: RuleData | null): RuleElementType | null {
  if (!rule) return null;

  const raw = rule.element_type ?? null;
  if (raw === 'start' || raw === 'decision' || raw === 'derive' || raw === 'end') return raw;

  return null;
}

const SEQUENCE_PATH_HINT = 'Sequence paths allowed: iriA/iriB (e.g. fbo:from/fbo-dk:UseCategory)';

const EXPRESSION_HINT =
  'Operators + - * / ( ), numbers, "strings", true/false/null, $path references ' +
  '(e.g. $fbo-lt:GCoeficient or a full IRI), functions min max abs sqrt floor ceil round pow ' +
  'sin cos tan sind cosd tand and lookup(x, [[lo, hi, value], ...]). No comparisons or conditionals.';

function OntologySuggestionList({
  visible,
  loading,
  suggestions,
  onSelect,
}: {
  visible: boolean;
  loading: boolean;
  suggestions: OntologyTermSuggestion[];
  onSelect: (term: OntologyTermSuggestion) => void;
}) {
  if (!visible) return null;

  return (
    <div className="mt-1 overflow-hidden rounded-md border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center gap-1 border-b border-gray-100 px-2 py-1 text-[10px] font-semibold tracking-wide text-gray-500 uppercase">
        <MagnifyingGlassIcon className="h-3 w-3" />
        {loading ? 'Searching selected ontologies…' : 'Ontology suggestions'}
      </div>
      {!loading && suggestions.length === 0 ? (
        <p className="px-2 py-2 text-xs text-gray-500">No matching terms found.</p>
      ) : (
        <div className="max-h-48 overflow-y-auto">
          {suggestions.slice(0, 8).map((term) => (
            <button
              key={`${term.ontology_id}:${term.uri}`}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSelect(term)}
              className="block w-full border-b border-gray-100 px-2 py-2 text-left last:border-0 hover:bg-orange-50"
              title={term.uri}
            >
              <span className="block truncate text-xs font-medium text-gray-900">
                {term.label ?? term.term_id}
              </span>
              <span className="block truncate font-mono text-[10px] text-gray-500">
                {term.ontology_label} · {term.uri}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RuleInspectorPanel({
  selectedRule,
  onChange,
  onBuildTree,
  ontologyLibrary,
  selectedOntologyIds,
  onSelectedOntologyIdsChange,
  validationIssues,
  validationStatus,
  collapsed,
  onToggleCollapsed,
}: Props) {
  const [ontologyPickerOpen, setOntologyPickerOpen] = useState(false);
  const [activeSuggestionField, setActiveSuggestionField] = useState<
    'target_class' | 'property_path' | null
  >(null);
  const [targetClassSuggestions, setTargetClassSuggestions] = useState<OntologyTermSuggestion[]>(
    [],
  );
  const [propertyPathSuggestions, setPropertyPathSuggestions] = useState<OntologyTermSuggestion[]>(
    [],
  );
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const elementType = getEffectiveElementType(selectedRule);
  const isStart = elementType === 'start';
  const isDecision = elementType === 'decision';
  const isDerive = elementType === 'derive';
  const isEnd = elementType === 'end';
  const usesOntologyTerms = isDecision || isDerive;
  const valueIsRef = isValueRef(selectedRule?.value);
  const [valueMode, setValueMode] = useState<'literal' | 'ref'>(valueIsRef ? 'ref' : 'literal');
  const effectiveValueMode: 'literal' | 'ref' = valueIsRef ? 'ref' : valueMode;
  const hasConnectedStartBranch = Boolean(
    selectedRule?.true_path || selectedRule?.false_path || selectedRule?.unknown_path,
  );

  useEffect(() => {
    setValueMode(isValueRef(selectedRule?.value) ? 'ref' : 'literal');
  }, [selectedRule?.id, selectedRule?.value]);

  useEffect(() => {
    if (!usesOntologyTerms || selectedOntologyIds.length === 0 || !activeSuggestionField) {
      setTargetClassSuggestions([]);
      setPropertyPathSuggestions([]);
      setSuggestionsLoading(false);
      return;
    }

    let active = true;
    const search = inputValue(selectedRule?.[activeSuggestionField]);
    const timeout = window.setTimeout(() => {
      setSuggestionsLoading(true);
      void searchOntologyLibraryTerms(selectedOntologyIds, activeSuggestionField, search)
        .then((terms) => {
          if (!active) return;
          if (activeSuggestionField === 'target_class') setTargetClassSuggestions(terms);
          else setPropertyPathSuggestions(terms);
        })
        .finally(() => {
          if (active) setSuggestionsLoading(false);
        });
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [activeSuggestionField, usesOntologyTerms, selectedOntologyIds, selectedRule]);

  const toggleOntology = (ontologyId: string) => {
    const next = selectedOntologyIds.includes(ontologyId)
      ? selectedOntologyIds.filter((id) => id !== ontologyId)
      : [...selectedOntologyIds, ontologyId];
    onSelectedOntologyIdsChange(next);
  };

  const handleTextChange =
    (field: keyof RuleData) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = event.target.value;

      if (field === 'value' && isEnd) {
        const current_kind = String(selectedRule?.config?.end_kind ?? 'output');
        onChange({
          value,
          config: {
            ...selectedRule?.config,
            end_kind: current_kind,
            output_text: value,
          },
        });
        return;
      }

      onChange({ [field]: value });
    };

  const END_KINDS: Array<{ value: string; label: string; hint: string }> = [
    {
      value: 'output',
      label: 'Outcome (text)',
      hint: 'A defined outcome, e.g. "unit is AK2" — counts as reached, not as a violation',
    },
    { value: 'pass', label: 'Pass', hint: 'The requirement is met' },
    { value: 'fail', label: 'Fail', hint: 'The requirement is checked and not met' },
    {
      value: 'missing_data',
      label: 'Missing data',
      hint: 'A fact is missing or ambiguous — ask the user',
    },
    {
      value: 'not_applicable',
      label: 'Not applicable',
      hint: 'The rule does not apply to this target',
    },
    {
      value: 'rule',
      label: 'Continue in another rule',
      hint: 'Targets reaching this end are handed to the linked rule (the RuleBook chains it)',
    },
  ];
  const OPERATORS: Array<{ value: string; label: string; hint: string }> = [
    {
      value: '==',
      label: '== equals',
      hint: 'True when the value equals; a list of values means "one of"',
    },
    { value: '<', label: '< less than', hint: 'Numbers only' },
    { value: '<=', label: '≤ at most', hint: 'Numbers only' },
    { value: '>', label: '> more than', hint: 'Numbers only' },
    { value: '>=', label: '≥ at least', hint: 'Numbers only' },
    {
      value: 'between',
      label: 'between [low, high)',
      hint: 'Value is a two-item list; not with $ref',
    },
    {
      value: 'exists',
      label: 'exists (has a value)',
      hint: 'True when the path has at least one value, False otherwise — never Unknown; no value needed',
    },
  ];
  const isExistsOperator =
    String(selectedRule?.operator ?? '')
      .trim()
      .toLowerCase() === 'exists';
  const handleOperatorChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const operator = event.target.value || null;
    if (operator === 'exists') {
      onChange({ operator, value: null });
      return;
    }
    onChange({ operator });
  };

  const ruleTitle = String(selectedRule?.config?.rule_title ?? '');
  const ruleDescription = String(selectedRule?.config?.rule_description ?? '');
  const handleRuleMetaChange =
    (key: 'rule_title' | 'rule_description') =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const config = { ...(selectedRule?.config ?? {}) } as Record<string, unknown>;
      if (event.target.value.trim()) config[key] = event.target.value;
      else delete config[key];
      onChange({ config });
    };

  const endKind = String(selectedRule?.config?.end_kind ?? 'output');
  const nextRule = String(selectedRule?.config?.next_rule ?? '');
  const handleEndKindChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const end_kind = event.target.value;
    const config = { ...(selectedRule?.config ?? {}), end_kind } as Record<string, unknown>;
    if (end_kind !== 'rule') delete config.next_rule;
    onChange({ config });
  };
  const handleNextRuleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange({
      config: {
        ...(selectedRule?.config ?? {}),
        end_kind: 'rule',
        next_rule: event.target.value.trim(),
      },
    });
  };

  const handleValueRefChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange({ value: { $ref: event.target.value } });
  };

  const handleValueModeChange = (mode: 'literal' | 'ref') => {
    setValueMode(mode);
    if (mode === 'ref' && !isValueRef(selectedRule?.value)) {
      onChange({ value: { $ref: '' } });
    } else if (mode === 'literal' && isValueRef(selectedRule?.value)) {
      onChange({ value: '' });
    }
  };

  if (collapsed) {
    return (
      <aside className="flex w-10 flex-col items-center border-l border-gray-200 bg-white py-2">
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          title="Expand rule element details"
        >
          <Bars3Icon className="h-5 w-5" />
        </button>
      </aside>
    );
  }

  if (!selectedRule) {
    return (
      <aside className="w-80 border-l border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <div>
            <h2 className="rule-workspace-header">Rule element details</h2>
            <p className="text-xs text-gray-500">Select a rule element to inspect it</p>
          </div>

          <button
            type="button"
            onClick={onToggleCollapsed}
            className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            title="Collapse rule element details"
          >
            <Bars3Icon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex h-full items-center justify-center p-6 text-sm text-gray-400">
          Select a rule element to inspect and edit its properties.
        </div>
      </aside>
    );
  }

  const disabledClass =
    'w-full rounded-md border border-gray-200 bg-gray-100 px-3 py-2 text-sm text-gray-500';

  const activeClass = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm';
  const invalidClass =
    'w-full rounded-md border border-red-500 bg-red-50 px-3 py-2 text-sm text-red-900 focus:border-red-600 focus:ring-red-200';
  const issueFor = (field: RuleTermValidationIssue['field']) =>
    validationIssues.find((issue) => issue.field === field);
  const targetClassIssue = issueFor('target_class');
  const propertyPathIssue = issueFor('property_path');
  const refValueIssue = issueFor('value');
  const expressionIssue = issueFor('expression');
  const rawAcceptedTerms = selectedRule?.config?.accepted_terms;
  const acceptedTerms = Array.isArray(rawAcceptedTerms) ? rawAcceptedTerms.map(String) : [];
  const acceptTerm = (term: string) => {
    if (acceptedTerms.includes(term)) return;
    onChange({
      config: { ...(selectedRule?.config ?? {}), accepted_terms: [...acceptedTerms, term] },
    });
  };
  const unacceptTerm = (term: string) => {
    const next = acceptedTerms.filter((item) => item !== term);
    const config = { ...(selectedRule?.config ?? {}) } as Record<string, unknown>;
    if (next.length > 0) config.accepted_terms = next;
    else delete config.accepted_terms;
    onChange({ config });
  };
  const renderIssue = (
    issue: RuleTermValidationIssue | undefined,
    field: 'target_class' | 'property_path' | null,
    id: string,
  ) => {
    if (!issue) return null;
    return (
      <div
        id={id}
        role="alert"
        className="mt-1 space-y-1.5 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800"
      >
        <p>{issue.message}</p>
        <div className="flex flex-wrap gap-1.5">
          {field ? (
            <button
              type="button"
              onClick={() => {
                setActiveSuggestionField(field);
                if (selectedOntologyIds.length === 0) setOntologyPickerOpen(true);
              }}
              className="rounded border border-red-300 bg-white px-2 py-0.5 text-red-800 hover:bg-red-100"
            >
              Change the term
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setOntologyPickerOpen(true)}
            className="rounded border border-red-300 bg-white px-2 py-0.5 text-red-800 hover:bg-red-100"
          >
            Add ontologies ↗
          </button>
          <button
            type="button"
            onClick={() => acceptTerm(issue.value)}
            className="rounded border border-red-300 bg-white px-2 py-0.5 text-red-800 hover:bg-red-100"
            title="Keep this term on purpose: the warning is suppressed for this element"
          >
            Accept “{issue.value.split(/[#/]/).pop()}”
          </button>
        </div>
      </div>
    );
  };

  return (
    <aside className="w-80 border-l border-gray-200 bg-white">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <div>
            <h2 className="rule-workspace-header">Rule element details</h2>
            <p className="text-xs text-gray-500">Edit the selected rule element</p>
          </div>

          <button
            type="button"
            onClick={onToggleCollapsed}
            className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            title="Collapse rule element details"
          >
            <Bars3Icon className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-2 border-b border-gray-200 px-4 py-3">
          {isStart && onBuildTree ? (
            <button
              type="button"
              onClick={onBuildTree}
              disabled={!hasConnectedStartBranch}
              className="w-full rounded-md border border-indigo-300 bg-white px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-400"
              title={
                hasConnectedStartBranch
                  ? 'Build rule from selected start rule element'
                  : 'Connect the selected start rule element before building'
              }
            >
              Build rule from start rule element
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => setOntologyPickerOpen((open) => !open)}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-orange-300 bg-white px-3 py-2 text-sm font-medium text-orange-700 hover:bg-orange-50"
            aria-expanded={ontologyPickerOpen}
          >
            <BookOpenIcon className="h-4 w-4" />
            Standard Library ontologies
            {selectedOntologyIds.length > 0 ? ` (${selectedOntologyIds.length})` : ''}
          </button>

          {ontologyPickerOpen ? (
            <div className="space-y-2 rounded-md border border-orange-200 bg-orange-50 p-3">
              <p className="text-xs text-orange-900">
                Terms are checked against the ticked ontologies (every step of a path, derive
                expressions too). Tick the ontology that defines a term and its warning disappears;
                untick and it comes back.
              </p>
              {ontologyLibrary.map((ontology) => (
                <label key={ontology.id} className="flex cursor-pointer items-start gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={selectedOntologyIds.includes(ontology.id)}
                    onChange={() => toggleOntology(ontology.id)}
                    className="mt-0.5 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                  />
                  <span>
                    <span className="font-semibold text-gray-900">{ontology.label}</span>
                    <span className="block text-gray-500">{ontology.description}</span>
                  </span>
                </label>
              ))}
            </div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="space-y-4">
            {acceptedTerms.length > 0 ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                <div className="mb-1 font-medium">
                  Accepted terms (not checked against the ontologies)
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {acceptedTerms.map((term) => (
                    <button
                      key={term}
                      type="button"
                      onClick={() => unacceptTerm(term)}
                      title={`${term} — click to check it again`}
                      className="rounded border border-amber-300 bg-white px-2 py-0.5 font-mono text-[11px] hover:bg-amber-100"
                    >
                      {term.split(/[#/]/).pop()} ×
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div>
              <label className="mb-1 block text-xs font-medium tracking-wide text-gray-500 uppercase">
                ID
              </label>
              <input value={inputValue(selectedRule.id)} disabled className={disabledClass} />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium tracking-wide text-gray-500 uppercase">
                Rule element type
              </label>
              <input value={inputValue(elementType)} disabled className={disabledClass} />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium tracking-wide text-gray-500 uppercase">
                Label
              </label>
              <input
                value={inputValue(selectedRule.label)}
                onChange={handleTextChange('label')}
                className={activeClass}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium tracking-wide text-gray-500 uppercase">
                Target class
              </label>
              <input
                value={inputValue(selectedRule.target_class)}
                onChange={handleTextChange('target_class')}
                onFocus={() => setActiveSuggestionField('target_class')}
                disabled={!usesOntologyTerms}
                className={
                  usesOntologyTerms
                    ? targetClassIssue
                      ? invalidClass
                      : activeClass
                    : disabledClass
                }
                aria-invalid={Boolean(targetClassIssue)}
                aria-describedby={targetClassIssue ? 'target-class-validation-error' : undefined}
              />
              {renderIssue(targetClassIssue, 'target_class', 'target-class-validation-error')}
              {usesOntologyTerms && selectedOntologyIds.length > 0 ? (
                <OntologySuggestionList
                  visible={activeSuggestionField === 'target_class'}
                  loading={suggestionsLoading}
                  suggestions={targetClassSuggestions}
                  onSelect={(term) => {
                    onChange({ target_class: term.uri });
                    setActiveSuggestionField(null);
                  }}
                />
              ) : null}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium tracking-wide text-gray-500 uppercase">
                {isDerive ? 'Writes property' : 'Property path'}
              </label>
              <input
                value={inputValue(selectedRule.property_path)}
                onChange={handleTextChange('property_path')}
                onFocus={() => setActiveSuggestionField('property_path')}
                disabled={!usesOntologyTerms}
                className={
                  usesOntologyTerms
                    ? propertyPathIssue
                      ? invalidClass
                      : activeClass
                    : disabledClass
                }
                aria-invalid={Boolean(propertyPathIssue)}
                aria-describedby={propertyPathIssue ? 'property-path-validation-error' : undefined}
              />
              {renderIssue(propertyPathIssue, 'property_path', 'property-path-validation-error')}
              {isDecision ? (
                <p className="mt-1 text-[11px] text-gray-400">{SEQUENCE_PATH_HINT}</p>
              ) : null}
              {isDerive ? (
                <p className="mt-1 text-[11px] text-gray-400">
                  The single property this element writes on the target.
                </p>
              ) : null}
              {usesOntologyTerms && selectedOntologyIds.length > 0 ? (
                <OntologySuggestionList
                  visible={activeSuggestionField === 'property_path'}
                  loading={suggestionsLoading}
                  suggestions={propertyPathSuggestions}
                  onSelect={(term) => {
                    onChange({ property_path: term.uri });
                    setActiveSuggestionField(null);
                  }}
                />
              ) : null}
              {selectedOntologyIds.length > 0 && validationStatus === 'checking' ? (
                <p className="mt-1 text-[11px] text-gray-500">Checking terms with the API…</p>
              ) : null}
            </div>

            {isDerive ? (
              <div>
                <label className="mb-1 block text-xs font-medium tracking-wide text-gray-500 uppercase">
                  Expression
                </label>
                <textarea
                  value={inputValue(selectedRule.expression)}
                  onChange={handleTextChange('expression')}
                  rows={4}
                  spellCheck={false}
                  className={`${activeClass} font-mono`}
                  placeholder="e.g. $fbo-lt:GCoeficient * 2"
                />
                <p className="mt-1 text-[11px] text-gray-400">{EXPRESSION_HINT}</p>
                {renderIssue(expressionIssue, null, 'expression-validation-error')}
              </div>
            ) : (
              <>
                {isDecision && (
                  <div>
                    <label className="mb-1 block text-xs font-medium tracking-wide text-gray-500 uppercase">
                      Operator
                    </label>
                    <select
                      value={inputValue(selectedRule.operator)}
                      onChange={handleOperatorChange}
                      className={activeClass}
                    >
                      <option value="">Choose…</option>
                      {OPERATORS.map((op) => (
                        <option key={op.value} value={op.value}>
                          {op.label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-[11px] text-gray-400">
                      {OPERATORS.find((op) => op.value === selectedRule.operator)?.hint ??
                        'Decisions send each target down the True, False or Unknown path.'}
                    </p>
                  </div>
                )}

                {isStart && (
                  <div className="space-y-2 rounded-lg border border-sky-200 bg-sky-50/60 p-2">
                    <label className="block text-xs font-medium tracking-wide text-sky-800 uppercase">
                      Rule title
                    </label>
                    <input
                      value={ruleTitle}
                      onChange={handleRuleMetaChange('rule_title')}
                      className={activeClass}
                      placeholder="e.g. What is the maximum area of fire compartments?"
                    />
                    <label className="block text-xs font-medium tracking-wide text-sky-800 uppercase">
                      Rule description
                    </label>
                    <textarea
                      value={ruleDescription}
                      onChange={handleRuleMetaChange('rule_description')}
                      rows={2}
                      className={activeClass}
                      placeholder="One or two lines on what the rule checks and where it comes from"
                    />
                    <p className="text-[11px] text-sky-800/80">
                      The title is what the RuleBook and the rule library show (the Miro frame title
                      fits here). Without it, the start element's label is used with a leading
                      "Start:" removed.
                    </p>
                  </div>
                )}

                {!(isDecision && isExistsOperator) && (
                  <div>
                    <label className="mb-1 block text-xs font-medium tracking-wide text-gray-500 uppercase">
                      {isEnd ? 'Output (value)' : 'Value'}
                    </label>

                    {isEnd && (
                      <>
                        <p className="mb-1 text-[11px] text-gray-400">
                          This value is used as the rule output
                        </p>
                        <label className="mt-2 mb-1 block text-xs font-medium tracking-wide text-gray-500 uppercase">
                          Outcome kind
                        </label>
                        <select
                          value={endKind}
                          onChange={handleEndKindChange}
                          className={activeClass}
                        >
                          {END_KINDS.map((kind) => (
                            <option key={kind.value} value={kind.value}>
                              {kind.label}
                            </option>
                          ))}
                        </select>
                        <p className="mt-1 mb-2 text-[11px] text-gray-400">
                          {END_KINDS.find((kind) => kind.value === endKind)?.hint ?? ''}
                        </p>
                        {endKind === 'rule' && (
                          <>
                            <label className="mb-1 block text-xs font-medium tracking-wide text-gray-500 uppercase">
                              Linked rule id
                            </label>
                            <input
                              value={nextRule}
                              onChange={handleNextRuleChange}
                              className={`${activeClass} font-mono`}
                              placeholder="dk-compartments-size-ak2-v2"
                            />
                            <p className="mt-1 mb-2 text-[11px] text-gray-400">
                              When this rule runs in the RuleBook, the linked rule is run right
                              after it for exactly the targets that ended here.
                            </p>
                          </>
                        )}
                      </>
                    )}

                    {isDecision && (
                      <div className="mb-1 inline-flex rounded-md border border-gray-200 text-[11px]">
                        <button
                          type="button"
                          onClick={() => handleValueModeChange('literal')}
                          className={`rounded-l-md px-2 py-1 ${
                            effectiveValueMode === 'literal'
                              ? 'bg-gray-800 text-white'
                              : 'bg-white text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          Literal
                        </button>
                        <button
                          type="button"
                          onClick={() => handleValueModeChange('ref')}
                          className={`rounded-r-md px-2 py-1 ${
                            effectiveValueMode === 'ref'
                              ? 'bg-gray-800 text-white'
                              : 'bg-white text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          Other property ($ref)
                        </button>
                      </div>
                    )}

                    {isDecision && effectiveValueMode === 'ref' ? (
                      <>
                        <input
                          value={isValueRef(selectedRule.value) ? selectedRule.value.$ref : ''}
                          onChange={handleValueRefChange}
                          className={`${activeClass} font-mono`}
                          placeholder="fbo:from/fbo-dk:UseCategory"
                        />
                        <p className="mt-1 text-[11px] text-gray-400">
                          Compares with this other property path on the same target (not allowed
                          with operator "between").
                        </p>
                        {renderIssue(refValueIssue, null, 'ref-validation-error')}
                      </>
                    ) : isDecision ? (
                      <RuleLiteralValueEditor
                        key={selectedRule.id}
                        value={selectedRule.value}
                        onChange={(value) => onChange({ value })}
                        inputClassName={activeClass}
                      />
                    ) : (
                      <input
                        value={inputValue(selectedRule.value)}
                        onChange={handleTextChange('value')}
                        disabled={isStart}
                        className={!isStart ? activeClass : disabledClass}
                      />
                    )}
                  </div>
                )}
              </>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium tracking-wide text-gray-500 uppercase">
                Element ID
              </label>
              <input
                value={inputValue(selectedRule.element_id)}
                disabled
                className={disabledClass}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium tracking-wide text-gray-500 uppercase">
                Graph URI
              </label>
              <input
                value={inputValue(selectedRule.graph_uri)}
                disabled
                className={disabledClass}
              />
            </div>

            <div className="pt-2">
              <label className="mb-1 block text-xs font-medium tracking-wide text-gray-500 uppercase">
                JSON preview
              </label>
              <pre className="max-h-72 overflow-auto rounded-md border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
                {JSON.stringify(selectedRule, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

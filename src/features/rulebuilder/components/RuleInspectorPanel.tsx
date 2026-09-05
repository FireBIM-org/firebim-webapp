import { Bars3Icon, BookOpenIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { ChangeEvent, useEffect, useState } from 'react';

import type { RuleData } from '@/features/rulebuilder/editorStore';
import type { RuleTermValidationIssue } from '@/utils/api-client';

import {
  searchOntologyLibraryTerms,
  type OntologyLibraryEntry,
  type OntologyTermSuggestion,
} from '@/features/ontologies/library';

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
  if (raw === 'start' || raw === 'decision' || raw === 'end') return raw;

  return null;
}

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
  const isEnd = elementType === 'end';
  const hasConnectedStartBranch = Boolean(
    selectedRule?.true_path || selectedRule?.false_path || selectedRule?.unknown_path,
  );

  useEffect(() => {
    if (!isDecision || selectedOntologyIds.length === 0 || !activeSuggestionField) {
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
  }, [activeSuggestionField, isDecision, selectedOntologyIds, selectedRule]);

  const toggleOntology = (ontologyId: string) => {
    const next = selectedOntologyIds.includes(ontologyId)
      ? selectedOntologyIds.filter((id) => id !== ontologyId)
      : [...selectedOntologyIds, ontologyId];
    onSelectedOntologyIdsChange(next);
  };

  const handleTextChange = (field: keyof RuleData) => (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;

    if (field === 'value' && isEnd) {
      onChange({
        value,
        config: {
          ...selectedRule?.config,
          end_kind: 'output',
          output_text: value,
        },
      });
      return;
    }

    onChange({ [field]: value });
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
  const issueFor = (field: 'target_class' | 'property_path') =>
    validationIssues.find((issue) => issue.field === field);
  const targetClassIssue = issueFor('target_class');
  const propertyPathIssue = issueFor('property_path');

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
                Checked ontologies provide search help and API validation for decision target
                classes and property paths.
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
                disabled={!isDecision}
                className={
                  isDecision ? (targetClassIssue ? invalidClass : activeClass) : disabledClass
                }
                aria-invalid={Boolean(targetClassIssue)}
                aria-describedby={targetClassIssue ? 'target-class-validation-error' : undefined}
              />
              {targetClassIssue ? (
                <p
                  id="target-class-validation-error"
                  role="alert"
                  className="mt-1 text-xs text-red-700"
                >
                  {targetClassIssue.message}
                </p>
              ) : null}
              {isDecision && selectedOntologyIds.length > 0 ? (
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
                Property path
              </label>
              <input
                value={inputValue(selectedRule.property_path)}
                onChange={handleTextChange('property_path')}
                onFocus={() => setActiveSuggestionField('property_path')}
                disabled={!isDecision}
                className={
                  isDecision ? (propertyPathIssue ? invalidClass : activeClass) : disabledClass
                }
                aria-invalid={Boolean(propertyPathIssue)}
                aria-describedby={propertyPathIssue ? 'property-path-validation-error' : undefined}
              />
              {propertyPathIssue ? (
                <p
                  id="property-path-validation-error"
                  role="alert"
                  className="mt-1 text-xs text-red-700"
                >
                  {propertyPathIssue.message}
                </p>
              ) : null}
              {isDecision && selectedOntologyIds.length > 0 ? (
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

            <div>
              <label className="mb-1 block text-xs font-medium tracking-wide text-gray-500 uppercase">
                Operator
              </label>
              <input
                value={inputValue(selectedRule.operator)}
                onChange={handleTextChange('operator')}
                disabled={!isDecision}
                className={isDecision ? activeClass : disabledClass}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium tracking-wide text-gray-500 uppercase">
                {isEnd ? 'Output (value)' : 'Value'}
              </label>

              {isEnd && (
                <p className="mb-1 text-[11px] text-gray-400">
                  This value is used as the rule output
                </p>
              )}

              <input
                value={inputValue(selectedRule.value)}
                onChange={handleTextChange('value')}
                disabled={isStart}
                className={!isStart ? activeClass : disabledClass}
              />
            </div>

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

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowPathIcon,
  Bars3Icon,
  ChevronDownIcon,
  ChevronRightIcon,
  FolderPlusIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { deleteRule, getRule, getRulesHealth, listRules } from '../api';
import {
  ensureSeededExampleRules,
  getSeededExampleRuleDefinition,
} from '../examples';
import { getVisibleRuleLibraryGroups, useRuleBookStore } from '../store';
import type { RuleListItem } from '../types';

type Props = {
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  showApiStatus?: boolean;
};

function buildDraggablePayload(rule: RuleListItem) {
  return JSON.stringify({
    kind: 'rulebook-rule',
    rule_id: rule.rule_id,
    label: rule.label,
    graph_uri: rule.graph_uri ?? null,
    source: rule.source,
  });
}

function RuleCard({
  rule,
  selected,
  display_label,
  onClick,
}: {
  rule: RuleListItem;
  selected: boolean;
  display_label: string;
  onClick: (event: React.MouseEvent) => void;
}) {
  const handleDragStart = (event: React.DragEvent<HTMLDivElement>) => {
    event.dataTransfer.setData(
      'application/firebim-rulebook-rule',
      buildDraggablePayload(rule)
    );
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      draggable
      onClick={onClick}
      onDragStart={handleDragStart}
      className={[
        'cursor-move overflow-hidden rounded-xl border bg-white text-sm shadow-sm transition',
        selected
          ? 'border-sky-400 ring-2 ring-sky-200'
          : 'border-gray-200 hover:border-sky-200 hover:shadow-md',
      ].join(' ')}
    >
      <div className="border-b border-gray-100 px-3 py-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">
          Rule
        </div>
        <div className="mt-1 font-medium text-gray-900">{display_label}</div>
      </div>

      <div className="space-y-1 px-3 py-2">
        {rule.description ? (
          <div className="line-clamp-2 text-xs text-gray-500">
            {rule.description}
          </div>
        ) : (
          <div className="text-xs text-gray-400">
            Stored rule ready for the Rule Runner
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <div className="text-[10px] uppercase tracking-wide text-orange-600">
            {rule.source === 'api' ? 'stored' : 'example'}
          </div>

          {typeof rule.rule_element_count === 'number' && (
            <div className="text-[10px] text-gray-500">
              {rule.rule_element_count} rule elements
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CategorySection({
  category_id,
  label,
  system,
  rules,
  selected_rule_ids,
  custom_rule_labels,
  onToggleRuleSelected,
  onMoveSelectedRulesToCategory,
  onRenameCategory,
  onEmptyWasteBin,
}: {
  category_id: string;
  label: string;
  system?: boolean;
  rules: RuleListItem[];
  selected_rule_ids: string[];
  custom_rule_labels: Record<string, string>;
  onToggleRuleSelected: (rule_id: string, multi?: boolean) => void;
  onMoveSelectedRulesToCategory: (category_id: string) => void;
  onRenameCategory: (category_id: string) => void;
  onEmptyWasteBin: () => void;
}) {
  const [open, setOpen] = useState(true);
  const safe_rules = Array.isArray(rules) ? rules : [];
  const safe_selected_rule_ids = Array.isArray(selected_rule_ids)
    ? selected_rule_ids
    : [];
  const selected_count = safe_selected_rule_ids.length;
  const is_waste_bin = category_id === 'waste-bin';

  return (
    <div>
      <div className="flex items-center justify-between px-2 py-1">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="flex min-w-0 flex-1 items-center justify-between text-left text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-700"
        >
          <span className="truncate">{label}</span>
          {open ? (
            <ChevronDownIcon className="ml-2 h-4 w-4 shrink-0" />
          ) : (
            <ChevronRightIcon className="ml-2 h-4 w-4 shrink-0" />
          )}
        </button>

        <div className="ml-2 flex items-center gap-1">
          {!system && (
            <button
              type="button"
              onClick={() => onRenameCategory(category_id)}
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              title="Rename category"
            >
              <PencilSquareIcon className="h-4 w-4" />
            </button>
          )}

          {selected_count > 0 && !is_waste_bin && (
            <button
              type="button"
              onClick={() => onMoveSelectedRulesToCategory(category_id)}
              className="rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-blue-600 hover:bg-blue-50"
              title="Move selected here"
            >
              Move here
            </button>
          )}

          {is_waste_bin && (
            <button
              type="button"
              onClick={onEmptyWasteBin}
              className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
              title="Empty waste bin"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="mt-2 space-y-2 px-1">
          {safe_rules.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-200 px-3 py-4 text-center text-xs text-gray-400">
              No rules
            </div>
          ) : (
            safe_rules.map((rule) => (
              <RuleCard
                key={rule.rule_id}
                rule={rule}
                selected={safe_selected_rule_ids.includes(rule.rule_id)}
                display_label={
                  custom_rule_labels[rule.rule_id] || rule.label || rule.rule_id
                }
                onClick={(event) =>
                  onToggleRuleSelected(
                    rule.rule_id,
                    event.metaKey || event.ctrlKey
                  )
                }
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function RuleBookLibraryPanel({
  collapsed,
  onToggleCollapsed,
  showApiStatus = true,
}: Props) {
  const store_collapsed = useRuleBookStore((state) => state.library_collapsed);
  const available_rules = useRuleBookStore((state) => state.available_rules);
  const library_state = useRuleBookStore((state) => state.library_state);
  const library_state_hydrated = useRuleBookStore(
    (state) => state.library_state_hydrated
  );
  const library_selection = useRuleBookStore((state) => state.library_selection);
  const rules_api_online = useRuleBookStore((state) => state.rules_api_online);
  const rules_loading = useRuleBookStore((state) => state.rules_loading);
  const rules_error = useRuleBookStore((state) => state.rules_error);

  const hydrateLibraryStateFromStorage = useRuleBookStore(
    (state) => state.hydrateLibraryStateFromStorage
  );
  const setAvailableRules = useRuleBookStore((state) => state.setAvailableRules);
  const setSelectedRuleId = useRuleBookStore((state) => state.setSelectedRuleId);
  const setSelectedRuleDefinition = useRuleBookStore(
    (state) => state.setSelectedRuleDefinition
  );
  const setRulesApiOnline = useRuleBookStore((state) => state.setRulesApiOnline);
  const setRulesLoading = useRuleBookStore((state) => state.setRulesLoading);
  const setRulesError = useRuleBookStore((state) => state.setRulesError);
  const toggleLibraryCollapsed = useRuleBookStore(
    (state) => state.toggleLibraryCollapsed
  );
  const toggleRuleSelected = useRuleBookStore((state) => state.toggleRuleSelected);
  const createCategory = useRuleBookStore((state) => state.createCategory);
  const renameCategory = useRuleBookStore((state) => state.renameCategory);
  const moveSelectedRulesToCategory = useRuleBookStore(
    (state) => state.moveSelectedRulesToCategory
  );
  const moveSelectedRulesToWasteBin = useRuleBookStore(
    (state) => state.moveSelectedRulesToWasteBin
  );
  const emptyWasteBinLocal = useRuleBookStore((state) => state.emptyWasteBinLocal);
  const moveRulesToWasteBin = useRuleBookStore((state) => state.moveRulesToWasteBin);
  const removeAvailableRule = useRuleBookStore((state) => state.removeAvailableRule);

  const is_collapsed = collapsed ?? store_collapsed;
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const selected_rule_ids = useMemo(
    () =>
      Object.entries(library_selection)
        .filter(([, selected]) => selected)
        .map(([rule_id]) => rule_id),
    [library_selection]
  );

  useEffect(() => {
    hydrateLibraryStateFromStorage();
  }, [hydrateLibraryStateFromStorage]);

  const grouped_categories = useMemo(
    () => getVisibleRuleLibraryGroups(available_rules, library_state),
    [available_rules, library_state]
  );
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const visibleCategories = useMemo(() => {
    if (!normalizedQuery) return grouped_categories;

    return grouped_categories.map((category) => ({
      ...category,
      rules: (Array.isArray(category.rules) ? category.rules : []).filter((rule) => {
        const haystacks = [
          library_state.custom_rule_labels[rule.rule_id],
          rule.label,
          rule.description,
          rule.rule_id,
          rule.graph_uri,
        ];

        return haystacks.some(
          (value) =>
            typeof value === 'string' &&
            value.toLowerCase().includes(normalizedQuery)
        );
      }),
    }));
  }, [grouped_categories, library_state.custom_rule_labels, normalizedQuery]);

  const runHiddenSearchCommand = useCallback(async () => {
    const command = searchQuery.trim().toLowerCase();

    if (command !== 'delete duplicates') {
      return false;
    }

    const apiRules = available_rules.filter(
      (rule) =>
        rule.source === 'api' && !library_state.trashed_rule_ids.includes(rule.rule_id)
    );
    const duplicatesToTrash: string[] = [];
    const latestByLabel = new Map<string, string>();

    for (const rule of apiRules) {
      const displayLabel =
        library_state.custom_rule_labels[rule.rule_id] || rule.label || rule.rule_id;
      const duplicateKey = displayLabel.trim().toLowerCase();

      if (!duplicateKey) continue;

      const previousRuleId = latestByLabel.get(duplicateKey);
      if (previousRuleId) {
        duplicatesToTrash.push(previousRuleId);
      }

      latestByLabel.set(duplicateKey, rule.rule_id);
    }

    if (duplicatesToTrash.length === 0) {
      window.alert('No duplicate stored rules were found.');
      return true;
    }

    const ok = window.confirm(
      `Move ${duplicatesToTrash.length} older duplicate rule(s) to the waste bin?`
    );

    if (!ok) {
      return true;
    }

    moveRulesToWasteBin(duplicatesToTrash);
    window.alert(
      `Moved ${duplicatesToTrash.length} older duplicate rule(s) to the waste bin.`
    );
    return true;
  }, [
    available_rules,
    library_state.custom_rule_labels,
    library_state.trashed_rule_ids,
    moveRulesToWasteBin,
    searchQuery,
  ]);

  const loadAvailableRules = useCallback(async () => {
    setRulesLoading(true);
    setRulesError(null);

    try {
      const [health, api_rules] = await Promise.all([getRulesHealth(), listRules()]);

      setRulesApiOnline(Boolean(health.ok || health.status === 'ok'));
      setAvailableRules(ensureSeededExampleRules(api_rules));
    } catch (error) {
      setRulesApiOnline(false);
      setRulesError(error instanceof Error ? error.message : 'Failed to load rules');
      setAvailableRules(ensureSeededExampleRules([]));
    } finally {
      setRulesLoading(false);
    }
  }, [setAvailableRules, setRulesApiOnline, setRulesError, setRulesLoading]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        await loadAvailableRules();
        if (cancelled) return;
      } catch {
        if (cancelled) return;
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [loadAvailableRules]);

  useEffect(() => {
    if (selected_rule_ids.length !== 1) {
      return;
    }

    let cancelled = false;
    const selected_rule_id = selected_rule_ids[0];
    const selected_rule = available_rules.find(
      (rule) => rule.rule_id === selected_rule_id
    );

    async function loadSelectedRule() {
      try {
        if (selected_rule?.source === 'example') {
          const example_definition =
            getSeededExampleRuleDefinition(selected_rule_id);

          if (cancelled) return;

          setSelectedRuleId(selected_rule_id);
          setSelectedRuleDefinition(example_definition);
          return;
        }

        const definition = await getRule(selected_rule_id);

        if (cancelled) return;

        setSelectedRuleId(selected_rule_id);
        setSelectedRuleDefinition(definition);
      } catch {
        if (cancelled) return;

        setSelectedRuleId(selected_rule_id);
        setSelectedRuleDefinition(null);
      }
    }

    loadSelectedRule();

    return () => {
      cancelled = true;
    };
  }, [
    available_rules,
    selected_rule_ids,
    setSelectedRuleDefinition,
    setSelectedRuleId,
  ]);

  const handleToggleCollapsed = () => {
    if (onToggleCollapsed) {
      onToggleCollapsed();
      return;
    }

    toggleLibraryCollapsed();
  };

  const handleRenameCategory = (category_id: string) => {
    const category = library_state.categories.find((item) => item.id === category_id);

    if (!category || category.system) return;

    const next_label = window.prompt('Rename category', category.label);

    if (!next_label) return;

    renameCategory(category_id, next_label);
  };

  const handleEmptyWasteBin = async () => {
    const waste_bin_group = grouped_categories.find(
      (group) => group.id === 'waste-bin'
    );
    const trashed_rules = Array.isArray(waste_bin_group?.rules)
      ? waste_bin_group.rules
      : [];
    const api_rules_to_delete = trashed_rules.filter((rule) => rule.source === 'api');

    if (trashed_rules.length === 0) {
      return;
    }

    const ok = window.confirm(
      `Are you sure you want to permanently delete ${trashed_rules.length} rule(s)?`
    );

    if (!ok) return;

    setRulesLoading(true);
    setRulesError(null);

    try {
      for (const rule of api_rules_to_delete) {
        await deleteRule({
          rule_id: rule.rule_id,
          graph_uri: rule.graph_uri ?? null,
        });
      }

      emptyWasteBinLocal();

      for (const rule of trashed_rules) {
        removeAvailableRule(rule.rule_id);
      }
    } catch (error) {
      setRulesError(
        error instanceof Error ? error.message : 'Failed to empty waste bin'
      );
    } finally {
      setRulesLoading(false);
    }
  };

  if (is_collapsed) {
    return (
      <aside className="flex w-10 flex-col items-center border-r border-gray-200 bg-white py-2">
        <button
          type="button"
          onClick={handleToggleCollapsed}
          className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
        >
          <Bars3Icon className="h-5 w-5" />
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex w-80 flex-col border-r border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-3 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="rule-workspace-header">
              Rule library
            </div>
            <div className="text-xs text-gray-500">
              Browse stored Rules and drag them into the Rule Runner
            </div>
          </div>

          <div className="flex items-center gap-2">
            {showApiStatus && (
              <div
                className={[
                  'rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap',
                  rules_api_online
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-gray-200 bg-gray-50 text-gray-500',
                ].join(' ')}
                title="Rules API status"
              >
                {rules_api_online ? '(API online)' : '(API offline)'}
              </div>
            )}

            <button
              type="button"
              onClick={handleToggleCollapsed}
              className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            >
              <Bars3Icon className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-gray-200 px-3 py-2">
        <button
          type="button"
          onClick={() => createCategory()}
          disabled={!library_state_hydrated}
          className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <FolderPlusIcon className="h-4 w-4" />
          New category
        </button>

        <button
          type="button"
          onClick={() => moveSelectedRulesToWasteBin()}
          disabled={!library_state_hydrated || selected_rule_ids.length === 0}
          className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <TrashIcon className="h-4 w-4" />
          Waste bin
        </button>

        <button
          type="button"
          onClick={() => {
            void loadAvailableRules();
          }}
          disabled={rules_loading}
          className="inline-flex items-center rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          title="Refresh rules"
          aria-label="Refresh rules"
        >
          <ArrowPathIcon className={['h-4 w-4', rules_loading ? 'animate-spin' : ''].join(' ')} />
        </button>

        <button
          type="button"
          onClick={() => {
            setSearchOpen((prev) => {
              const next = !prev;
              if (!next) {
                setSearchQuery('');
              }
              return next;
            });
          }}
          className="ml-auto inline-flex items-center rounded-md border border-gray-200 px-2 py-1 text-gray-700 hover:bg-gray-50"
          title="Search rules"
          aria-label="Search rules"
        >
          <MagnifyingGlassIcon className="h-4 w-4" />
        </button>
      </div>

      {searchOpen && (
        <div className="border-b border-gray-200 px-3 py-2">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                void runHiddenSearchCommand().then((handled) => {
                  if (handled) {
                    setSearchQuery('');
                    setSearchOpen(false);
                  }
                });
              }}
              placeholder="Search rules"
              className="w-full rounded-md border border-gray-300 py-2 pl-9 pr-9 text-sm text-gray-800 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
            />
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-2 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                title="Clear search"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {(rules_loading || rules_error) && (
        <div className="border-b border-gray-200 px-3 py-2">
          {rules_loading && (
            <div className="text-xs text-gray-500">Loading rules…</div>
          )}

          {!rules_loading && rules_error && (
            <div className="text-xs text-red-600">{rules_error}</div>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3">
        {visibleCategories.map((category) => (
          <CategorySection
            key={category.id}
            category_id={category.id}
            label={category.label}
            system={category.system}
            rules={category.rules}
            selected_rule_ids={selected_rule_ids}
            custom_rule_labels={library_state.custom_rule_labels}
            onToggleRuleSelected={toggleRuleSelected}
            onMoveSelectedRulesToCategory={moveSelectedRulesToCategory}
            onRenameCategory={handleRenameCategory}
            onEmptyWasteBin={handleEmptyWasteBin}
          />
        ))}
      </div>
    </aside>
  );
}

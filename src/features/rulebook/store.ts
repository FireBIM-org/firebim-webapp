import { create } from 'zustand';
import { SEEDED_EXAMPLE_RULE_IDS } from './examples';

const MANAGED_EXAMPLE_RULE_IDS = [
  ...SEEDED_EXAMPLE_RULE_IDS,
  'building-height',
  'building-large-height-fire-check',
  'large-building-fire-height-sequence',
];
import { DEFAULT_RULEBOOK_CATEGORIES } from './library';
import type {
  BuildingGraphData,
  ExecutionTimeline,
  RuleBookLibraryState,
  RuleDefinition,
  RuleLibrarySelection,
  RuleListItem,
  RuleRunnerItem,
} from './types';

const STORAGE_KEY = 'firebim-rulebook-library-state-v1';

function defaultLibraryState(): RuleBookLibraryState {
  return {
    categories: [...DEFAULT_RULEBOOK_CATEGORIES],
    rule_category_map: {},
    custom_rule_labels: {},
    trashed_rule_ids: [],
  };
}

function normalizeLibraryState(input: RuleBookLibraryState): RuleBookLibraryState {
  const next_rule_category_map = { ...input.rule_category_map };
  const next_trashed_rule_ids = input.trashed_rule_ids.filter(
    (rule_id) => !MANAGED_EXAMPLE_RULE_IDS.includes(rule_id),
  );

  for (const rule_id of MANAGED_EXAMPLE_RULE_IDS) {
    next_rule_category_map[rule_id] = 'examples';
  }

  return {
    ...input,
    rule_category_map: next_rule_category_map,
    custom_rule_labels: {
      ...input.custom_rule_labels,
      'building-height':
        input.custom_rule_labels['building-height'] ||
        'Entry_Target - Building - 1 decision elements',
    },
    trashed_rule_ids: next_trashed_rule_ids,
  };
}

function readLibraryStateFromStorage(): RuleBookLibraryState {
  if (typeof window === 'undefined') {
    return normalizeLibraryState(defaultLibraryState());
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return normalizeLibraryState(defaultLibraryState());
    }

    const parsed = JSON.parse(raw) as Partial<RuleBookLibraryState>;

    return normalizeLibraryState({
      categories: Array.isArray(parsed.categories)
        ? parsed.categories
        : defaultLibraryState().categories,
      rule_category_map:
        parsed.rule_category_map && typeof parsed.rule_category_map === 'object'
          ? parsed.rule_category_map
          : {},
      custom_rule_labels:
        parsed.custom_rule_labels && typeof parsed.custom_rule_labels === 'object'
          ? parsed.custom_rule_labels
          : {},
      trashed_rule_ids: Array.isArray(parsed.trashed_rule_ids) ? parsed.trashed_rule_ids : [],
    });
  } catch {
    return normalizeLibraryState(defaultLibraryState());
  }
}

function persistLibraryState(library_state: RuleBookLibraryState) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeLibraryState(library_state)));
  } catch {
    // ignore persistence errors
  }
}

function uniqueByRuleId(items: RuleListItem[]): RuleListItem[] {
  const seen = new Set<string>();
  const result: RuleListItem[] = [];

  for (const item of items) {
    if (seen.has(item.rule_id)) continue;
    seen.add(item.rule_id);
    result.push(item);
  }

  return result;
}

function sortRuleBookCategories(categories: RuleBookLibraryState['categories']) {
  return [...categories].sort((a, b) => {
    if (a.id === 'waste-bin') return 1;
    if (b.id === 'waste-bin') return -1;
    return a.label.localeCompare(b.label);
  });
}

export type RuleBookStore = {
  available_rules: RuleListItem[];
  selected_rule_id: string | null;
  selected_rule_definition: RuleDefinition | null;

  rules_api_online: boolean;
  rules_loading: boolean;
  rules_error: string | null;

  library_state: RuleBookLibraryState;
  library_selection: RuleLibrarySelection;
  library_state_hydrated: boolean;

  runner_rule_items: RuleRunnerItem[];

  library_collapsed: boolean;

  available_graphs: BuildingGraphData[];
  selected_graph_source: string;
  active_graph_uri: string | null;
  active_graph_data: BuildingGraphData | null;
  graph_loaded: boolean;
  graph_loading: boolean;
  graph_error: string | null;

  execution_status: 'idle' | 'ready' | 'running' | 'paused' | 'complete';
  execution_solver: 'standard' | 'horizontal' | 'vertical';
  execution_timeline: ExecutionTimeline | null;
  current_step_index: number;
  execution_playback_ms: number;

  hydrateLibraryStateFromStorage: () => void;

  setAvailableRules: (rules: RuleListItem[]) => void;
  upsertAvailableRule: (rule: RuleListItem) => void;
  removeAvailableRule: (rule_id: string) => void;

  setSelectedRuleId: (rule_id: string | null) => void;
  setSelectedRuleDefinition: (rule: RuleDefinition | null) => void;

  setRulesApiOnline: (value: boolean) => void;
  setRulesLoading: (value: boolean) => void;
  setRulesError: (value: string | null) => void;

  toggleLibraryCollapsed: () => void;

  toggleRuleSelected: (rule_id: string, multi?: boolean) => void;
  clearRuleSelection: () => void;

  createCategory: () => void;
  renameCategory: (category_id: string, label: string) => void;
  moveSelectedRulesToCategory: (category_id: string) => void;
  moveSelectedRulesToWasteBin: () => void;
  moveRulesToWasteBin: (rule_ids: string[]) => void;
  restoreRuleFromWasteBin: (rule_id: string) => void;
  emptyWasteBinLocal: () => string[];

  setCustomRuleLabel: (rule_id: string, label: string) => void;

  addRuleToRunner: (rule: RuleListItem) => void;
  removeRuleFromRunner: (runner_item_id: string) => void;
  moveRunnerItem: (from_index: number, to_index: number) => void;
  clearRunner: () => void;

  setAvailableGraphs: (graphs: BuildingGraphData[]) => void;
  setSelectedGraphSource: (value: string) => void;
  setActiveGraphUri: (graph_uri: string | null) => void;
  setActiveGraphData: (graph: BuildingGraphData | null) => void;
  setGraphLoaded: (value: boolean) => void;
  setGraphLoading: (value: boolean) => void;
  setGraphError: (value: string | null) => void;

  setExecutionStatus: (value: 'idle' | 'ready' | 'running' | 'paused' | 'complete') => void;
  setExecutionSolver: (value: 'standard' | 'horizontal' | 'vertical') => void;
  setExecutionTimeline: (timeline: ExecutionTimeline | null) => void;
  setCurrentStepIndex: (value: number) => void;
  setExecutionPlaybackMs: (value: number) => void;
  resetExecution: () => void;
};

export const useRuleBookStore = create<RuleBookStore>((set, get) => ({
  available_rules: [],
  selected_rule_id: null,
  selected_rule_definition: null,

  rules_api_online: false,
  rules_loading: false,
  rules_error: null,

  library_state: normalizeLibraryState(defaultLibraryState()),
  library_selection: {},
  library_state_hydrated: false,

  runner_rule_items: [],

  library_collapsed: false,

  available_graphs: [],
  selected_graph_source: '',
  active_graph_uri: null,
  active_graph_data: null,
  graph_loaded: false,
  graph_loading: false,
  graph_error: null,

  execution_status: 'idle',
  execution_solver: 'standard',
  execution_timeline: null,
  current_step_index: 0,
  execution_playback_ms: 900,

  hydrateLibraryStateFromStorage: () => {
    const hydrated = readLibraryStateFromStorage();

    set((state) => ({
      library_state: hydrated,
      library_state_hydrated: true,
      library_selection: Object.fromEntries(
        Object.entries(state.library_selection).filter(([rule_id]) =>
          state.available_rules.some((item) => item.rule_id === rule_id),
        ),
      ),
    }));
  },

  setAvailableRules: (rules) =>
    set((state) => {
      const next = uniqueByRuleId(rules);

      return {
        available_rules: next,
        library_selection: Object.fromEntries(
          Object.entries(state.library_selection).filter(([rule_id]) =>
            next.some((item) => item.rule_id === rule_id),
          ),
        ),
      };
    }),

  upsertAvailableRule: (rule) =>
    set((state) => {
      const rest = state.available_rules.filter((item) => item.rule_id !== rule.rule_id);

      return {
        available_rules: uniqueByRuleId([...rest, rule]).sort((a, b) =>
          a.label.localeCompare(b.label),
        ),
      };
    }),

  removeAvailableRule: (rule_id) =>
    set((state) => {
      const next_available_rules = state.available_rules.filter((item) => item.rule_id !== rule_id);

      const library_state = normalizeLibraryState({
        ...state.library_state,
        trashed_rule_ids: state.library_state.trashed_rule_ids.filter((id) => id !== rule_id),
      });

      persistLibraryState(library_state);

      return {
        available_rules: next_available_rules,
        library_state,
        library_selection: Object.fromEntries(
          Object.entries(state.library_selection).filter(
            ([selected_rule_id]) => selected_rule_id !== rule_id,
          ),
        ),
        selected_rule_id: state.selected_rule_id === rule_id ? null : state.selected_rule_id,
      };
    }),

  setSelectedRuleId: (rule_id) => set({ selected_rule_id: rule_id }),
  setSelectedRuleDefinition: (rule) => set({ selected_rule_definition: rule }),

  setRulesApiOnline: (value) => set({ rules_api_online: value }),
  setRulesLoading: (value) => set({ rules_loading: value }),
  setRulesError: (value) => set({ rules_error: value }),

  toggleLibraryCollapsed: () => set((state) => ({ library_collapsed: !state.library_collapsed })),

  toggleRuleSelected: (rule_id, multi = false) =>
    set((state) => {
      if (multi) {
        const next = { ...state.library_selection };
        next[rule_id] = !next[rule_id];

        if (!next[rule_id]) {
          delete next[rule_id];
        }

        return {
          library_selection: next,
          selected_rule_id: rule_id,
        };
      }

      const already_only_selected =
        Object.keys(state.library_selection).length === 1 && state.library_selection[rule_id];

      return {
        library_selection: already_only_selected ? {} : { [rule_id]: true },
        selected_rule_id: rule_id,
      };
    }),

  clearRuleSelection: () => set({ library_selection: {} }),

  createCategory: () =>
    set((state) => {
      const next_index =
        state.library_state.categories.filter((category) => !category.system).length + 1;

      const next_category = {
        id: `custom-${Date.now()}`,
        label: `Category ${next_index}`,
        system: false,
      };

      const library_state = normalizeLibraryState({
        ...state.library_state,
        categories: [...state.library_state.categories, next_category],
      });

      persistLibraryState(library_state);

      return { library_state };
    }),

  renameCategory: (category_id, label) =>
    set((state) => {
      const trimmed = label.trim();

      if (!trimmed) {
        return state;
      }

      const library_state = normalizeLibraryState({
        ...state.library_state,
        categories: state.library_state.categories.map((category) =>
          category.id === category_id && !category.system
            ? { ...category, label: trimmed }
            : category,
        ),
      });

      persistLibraryState(library_state);

      return { library_state };
    }),

  moveSelectedRulesToCategory: (category_id) =>
    set((state) => {
      const selected_rule_ids = Object.keys(state.library_selection);

      if (selected_rule_ids.length === 0) {
        return state;
      }

      const next_rule_category_map = {
        ...state.library_state.rule_category_map,
      };

      for (const rule_id of selected_rule_ids) {
        next_rule_category_map[rule_id] = category_id;
      }

      const next_trashed_rule_ids = state.library_state.trashed_rule_ids.filter(
        (rule_id) => !selected_rule_ids.includes(rule_id),
      );

      const library_state = normalizeLibraryState({
        ...state.library_state,
        rule_category_map: next_rule_category_map,
        trashed_rule_ids: next_trashed_rule_ids,
      });

      persistLibraryState(library_state);

      return {
        library_state,
        library_selection: {},
      };
    }),

  moveSelectedRulesToWasteBin: () =>
    set((state) => {
      const selected_rule_ids = Object.keys(state.library_selection);

      if (selected_rule_ids.length === 0) {
        return state;
      }

      const trashed = new Set(state.library_state.trashed_rule_ids);

      for (const rule_id of selected_rule_ids) {
        trashed.add(rule_id);
      }

      const library_state = normalizeLibraryState({
        ...state.library_state,
        trashed_rule_ids: Array.from(trashed),
      });

      persistLibraryState(library_state);

      return {
        library_state,
        library_selection: {},
      };
    }),

  moveRulesToWasteBin: (rule_ids) =>
    set((state) => {
      if (rule_ids.length === 0) {
        return state;
      }

      const trashed = new Set(state.library_state.trashed_rule_ids);

      for (const rule_id of rule_ids) {
        trashed.add(rule_id);
      }

      const library_state = normalizeLibraryState({
        ...state.library_state,
        trashed_rule_ids: Array.from(trashed),
      });

      persistLibraryState(library_state);

      return {
        library_state,
        library_selection: Object.fromEntries(
          Object.entries(state.library_selection).filter(
            ([selected_rule_id]) => !rule_ids.includes(selected_rule_id),
          ),
        ),
        selected_rule_id: rule_ids.includes(state.selected_rule_id || '')
          ? null
          : state.selected_rule_id,
      };
    }),

  restoreRuleFromWasteBin: (rule_id) =>
    set((state) => {
      const library_state = normalizeLibraryState({
        ...state.library_state,
        trashed_rule_ids: state.library_state.trashed_rule_ids.filter((id) => id !== rule_id),
      });

      persistLibraryState(library_state);

      return { library_state };
    }),

  emptyWasteBinLocal: () => {
    const deleted_rule_ids = [...get().library_state.trashed_rule_ids];

    set((state) => {
      const library_state = normalizeLibraryState({
        ...state.library_state,
        trashed_rule_ids: [],
      });

      persistLibraryState(library_state);

      return { library_state };
    });

    return deleted_rule_ids;
  },

  setCustomRuleLabel: (rule_id, label) =>
    set((state) => {
      const library_state = normalizeLibraryState({
        ...state.library_state,
        custom_rule_labels: {
          ...state.library_state.custom_rule_labels,
          [rule_id]: label,
        },
      });

      persistLibraryState(library_state);

      return { library_state };
    }),

  addRuleToRunner: (rule) =>
    set((state) => ({
      runner_rule_items: [
        ...state.runner_rule_items,
        {
          runner_item_id: `runner-${rule.rule_id}-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 8)}`,
          rule_id: rule.rule_id,
          label: rule.label,
          graph_uri: rule.graph_uri ?? null,
        },
      ],
    })),

  removeRuleFromRunner: (runner_item_id) =>
    set((state) => ({
      runner_rule_items: state.runner_rule_items.filter(
        (item) => item.runner_item_id !== runner_item_id,
      ),
    })),

  moveRunnerItem: (from_index, to_index) =>
    set((state) => {
      const next = [...state.runner_rule_items];

      if (
        from_index < 0 ||
        to_index < 0 ||
        from_index >= next.length ||
        to_index >= next.length ||
        from_index === to_index
      ) {
        return state;
      }

      const [moved] = next.splice(from_index, 1);
      next.splice(to_index, 0, moved);

      return {
        runner_rule_items: next,
      };
    }),

  clearRunner: () => set({ runner_rule_items: [] }),

  setAvailableGraphs: (graphs) => set({ available_graphs: graphs }),
  setSelectedGraphSource: (value) => set({ selected_graph_source: value }),
  setActiveGraphUri: (graph_uri) => set({ active_graph_uri: graph_uri }),
  setActiveGraphData: (graph) => set({ active_graph_data: graph }),
  setGraphLoaded: (value) => set({ graph_loaded: value }),
  setGraphLoading: (value) => set({ graph_loading: value }),
  setGraphError: (value) => set({ graph_error: value }),

  setExecutionStatus: (value) => set({ execution_status: value }),
  setExecutionSolver: (value) => set({ execution_solver: value }),
  setExecutionTimeline: (timeline) => set({ execution_timeline: timeline }),
  setCurrentStepIndex: (value) => set({ current_step_index: value }),
  setExecutionPlaybackMs: (value) => set({ execution_playback_ms: value }),

  resetExecution: () =>
    set({
      execution_status: 'ready',
      execution_timeline: null,
      current_step_index: 0,
      execution_playback_ms: 900,
    }),
}));

export function getVisibleRuleLibraryGroups(
  available_rules: RuleListItem[],
  library_state: RuleBookLibraryState,
) {
  return sortRuleBookCategories(library_state.categories).map((category) => {
    const rules = available_rules
      .filter((rule) => {
        const is_trashed = library_state.trashed_rule_ids.includes(rule.rule_id);
        const mapped_category_id = library_state.rule_category_map[rule.rule_id];

        if (category.id === 'waste-bin') {
          return is_trashed;
        }

        if (is_trashed) {
          return false;
        }

        if (mapped_category_id) {
          return mapped_category_id === category.id;
        }

        if (category.id === 'examples') {
          return rule.source === 'example';
        }

        if (category.id === 'saved-rules') {
          return rule.source === 'api';
        }

        return false;
      })
      .sort((a, b) => a.label.localeCompare(b.label));

    return {
      ...category,
      rules,
    };
  });
}

import {
  RuleLibraryCategory,
  RuleLibraryCategoryMeta,
  RuleLibraryState,
  RuleNodeTemplate,
} from './types';

export const RULE_LIBRARY_STORAGE_KEY = 'firebim-rule-library-v2';

export const DEFAULT_CATEGORY_META: RuleLibraryCategoryMeta[] = [
  {
    id: 'under-development',
    label: 'Under development',
    system: true,
    order: 0,
  },
  {
    id: 'trash',
    label: 'Waste bin',
    system: true,
    order: 999,
  },
];

export const DEFAULT_LOCAL_TEMPLATES: RuleNodeTemplate[] = [
  {
    id: 'local:start',
    type: 'start',
    label: 'Start node',
    description: 'Entry point for a rule flow',
    source: 'local',
    template: {
      node_type: 'start',
      label: 'Start',
      config: {},
    },
  },
  {
    id: 'local:decision',
    type: 'decision',
    label: 'Decision node',
    description: 'Branch by true / false / unknown',
    source: 'local',
    template: {
      node_type: 'decision',
      label: 'Decision',
      target_class: null,
      property_path: null,
      operator: null,
      value: null,
      true_path: null,
      false_path: null,
      unknown_path: null,
      config: {},
    },
  },
  {
    id: 'local:end',
    type: 'end',
    label: 'End node',
    description: 'Terminal output node',
    source: 'local',
    template: {
      node_type: 'end',
      label: 'End',
      config: {},
    },
  },
];

/**
 * Temporary backward-compatible export.
 */
export const RULE_LIBRARY: RuleLibraryCategory[] = [
  {
    id: 'under-development',
    label: 'Under development',
    system: true,
    items: DEFAULT_LOCAL_TEMPLATES,
  },
  {
    id: 'trash',
    label: 'Waste bin',
    system: true,
    items: [],
  },
];

export function createDefaultLibraryState(
  items: RuleNodeTemplate[] = DEFAULT_LOCAL_TEMPLATES
): RuleLibraryState {
  const itemCategory: Record<string, string> = {};
  const itemLabels: Record<string, string> = {};

  for (const item of items) {
    itemCategory[item.id] = 'under-development';
    itemLabels[item.id] = item.label;
  }

  return {
    categories: DEFAULT_CATEGORY_META,
    itemCategory,
    itemLabels,
    deletedItemIds: [],
  };
}

export function loadLibraryState(
  items: RuleNodeTemplate[] = DEFAULT_LOCAL_TEMPLATES
): RuleLibraryState {
  if (typeof window === 'undefined') {
    return createDefaultLibraryState(items);
  }

  try {
    const raw = window.localStorage.getItem(RULE_LIBRARY_STORAGE_KEY);
    if (!raw) {
      return createDefaultLibraryState(items);
    }

    const parsed = JSON.parse(raw) as Partial<RuleLibraryState>;

    const categories = Array.isArray(parsed.categories)
      ? parsed.categories
      : DEFAULT_CATEGORY_META;

    const itemCategory =
      parsed.itemCategory && typeof parsed.itemCategory === 'object'
        ? parsed.itemCategory
        : {};

    const itemLabels =
      parsed.itemLabels && typeof parsed.itemLabels === 'object'
        ? parsed.itemLabels
        : {};

    const deletedItemIds = Array.isArray(parsed.deletedItemIds)
      ? parsed.deletedItemIds
      : [];

    const mergedItemCategory: Record<string, string> = { ...itemCategory };
    const mergedItemLabels: Record<string, string> = { ...itemLabels };

    for (const item of items) {
      if (!mergedItemCategory[item.id]) {
        mergedItemCategory[item.id] = 'under-development';
      }
      if (!mergedItemLabels[item.id]) {
        mergedItemLabels[item.id] = item.label;
      }
    }

    return {
      categories,
      itemCategory: mergedItemCategory,
      itemLabels: mergedItemLabels,
      deletedItemIds,
    };
  } catch {
    return createDefaultLibraryState(items);
  }
}

export function saveLibraryState(state: RuleLibraryState) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(RULE_LIBRARY_STORAGE_KEY, JSON.stringify(state));
}

export function createCategoryId(label: string) {
  const normalized = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || `category-${Date.now()}`;
}
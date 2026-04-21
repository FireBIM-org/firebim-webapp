export type RuleElementType = 'start' | 'decision' | 'end';

export type RuleElementSource = 'local' | 'api';

export type RuleElementTemplate = {
  id: string;
  type: RuleElementType;
  label: string;
  description?: string;
  source?: RuleElementSource;
  element_id?: string;
  template: {
    element_type: RuleElementType;
    label?: string | null;
    target_class?: string | null;
    property_path?: string | null;
    operator?: string | null;
    value?: unknown;
    true_path?: string | null;
    false_path?: string | null;
    unknown_path?: string | null;
    config?: Record<string, unknown>;
    graph_uri?: string | null;
    element_id?: string | null;
  };
};

export type RuleLibraryCategory = {
  id: string;
  label: string;
  system?: boolean;
  items: RuleElementTemplate[];
};

export type RuleLibraryCategoryMeta = {
  id: string;
  label: string;
  system?: boolean;
  order: number;
};

export type RuleLibraryState = {
  categories: RuleLibraryCategoryMeta[];
  itemCategory: Record<string, string>;
  itemLabels: Record<string, string>;
  deletedItemIds: string[];
};

export type RuleLibrarySelection = Record<string, boolean>;


// Backward-compatible aliases while components are being renamed.
export type RuleNodeType = RuleElementType;
export type RuleNodeSource = RuleElementSource;
export type RuleNodeTemplate = RuleElementTemplate;

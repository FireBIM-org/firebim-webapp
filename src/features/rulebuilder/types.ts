export type RuleNodeType = 'start' | 'decision' | 'end';

export type RuleNodeSource = 'local' | 'api';

export type RuleNodeTemplate = {
  id: string;
  type: RuleNodeType;
  label: string;
  description?: string;
  source?: RuleNodeSource;
  element_id?: string;
  template: {
    node_type: RuleNodeType;
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
  };
};

export type RuleLibraryCategory = {
  id: string;
  label: string;
  system?: boolean;
  items: RuleNodeTemplate[];
};

export type RuleLibraryCategoryMeta = {
  id: string;
  label: string;
  system?: boolean;
  order: number;
};

export type RuleLibraryItemMeta = {
  item_id: string;
  category_id: string;
  deleted?: boolean;
};

export type RuleLibraryState = {
  categories: RuleLibraryCategoryMeta[];
  itemCategory: Record<string, string>;
};

export type RuleLibrarySelection = Record<string, boolean>;
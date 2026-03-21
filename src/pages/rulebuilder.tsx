import { useCallback, useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import RuleLibraryPanel from '@/features/rulebuilder/components/RuleLibraryPanel';
import RuleCanvas from '@/features/rulebuilder/components/RuleCanvas';
import RuleInspectorPanel from '@/features/rulebuilder/components/RuleInspectorPanel';
import { RULE_LIBRARY } from '@/features/rulebuilder/library';
import {
  EXAMPLE_RULE_ELEMENTS,
  ensureExampleRuleElements,
  deleteRuleElement,
  deriveRuleElement,
  getRulesHealth,
  listRuleElementsDetailed,
  publishRuleElement,
} from '@/features/rulebuilder/api';
import { RuleLibraryCategory } from '@/features/rulebuilder/types';

type ApiStatus = 'loading' | 'online' | 'offline';

type RuleData = {
  id: string;
  node_type: 'start' | 'decision' | 'end';
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

type PublishState = 'idle' | 'saving' | 'success' | 'error';

type LibraryItem = RuleLibraryCategory['items'][number] & {
  id: string;
  source?: 'local' | 'api';
  element_id?: string;
  template: RuleLibraryCategory['items'][number]['template'] & {
    graph_uri?: string | null;
  };
};

type CategoryMeta = {
  id: string;
  label: string;
  system?: boolean;
  order: number;
};

type LibraryState = {
  categories: CategoryMeta[];
  itemCategory: Record<string, string>;
  itemLabels: Record<string, string>;
};

const LIBRARY_STORAGE_KEY = 'firebim-rule-library-v3';
const DEFAULT_CATEGORY_META: CategoryMeta[] = [
  { id: 'examples', label: 'Examples', system: true, order: 0 },
  { id: 'under-development', label: 'Under development', system: true, order: 10 },
  { id: 'trash', label: 'Waste bin', system: true, order: 999 },
];

function createCategoryId(label: string) {
  const normalized = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || `category-${Date.now()}`;
}

function dedupeCategoryId(baseId: string, existingIds: string[]) {
  if (!existingIds.includes(baseId)) return baseId;

  let index = 2;
  let candidate = `${baseId}-${index}`;

  while (existingIds.includes(candidate)) {
    index += 1;
    candidate = `${baseId}-${index}`;
  }

  return candidate;
}

function normalizeLocalLibraryItems(): LibraryItem[] {
  const localCategory = RULE_LIBRARY.find((category) => category.id === 'under-development');
  const items = localCategory?.items || [];

  return items.map((item, index) => {
    const baseId =
      item.type === 'start'
        ? 'local:start'
        : item.type === 'end'
        ? 'local:end'
        : index === 0
        ? 'local:decision'
        : `local:${item.type}:${index}`;

    return {
      ...item,
      id: baseId,
      source: 'local',
      template: {
        ...item.template,
        label: item.template.label || item.label,
      },
    };
  });
}

function createDefaultLibraryState(localItems: LibraryItem[]): LibraryState {
  const itemCategory: Record<string, string> = {};
  const itemLabels: Record<string, string> = {};

  for (const item of localItems) {
    itemCategory[item.id] = 'under-development';
    itemLabels[item.id] = item.label;
  }

  return {
    categories: DEFAULT_CATEGORY_META,
    itemCategory,
    itemLabels,
  };
}

function loadLibraryState(localItems: LibraryItem[]): LibraryState {
  if (typeof window === 'undefined') {
    return createDefaultLibraryState(localItems);
  }

  try {
    const raw = window.localStorage.getItem(LIBRARY_STORAGE_KEY);
    if (!raw) {
      return createDefaultLibraryState(localItems);
    }

    const parsed = JSON.parse(raw) as Partial<LibraryState>;

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

    const mergedItemCategory: Record<string, string> = { ...itemCategory };
    const mergedItemLabels: Record<string, string> = { ...itemLabels };

    for (const item of localItems) {
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
    };
  } catch {
    return createDefaultLibraryState(localItems);
  }
}

function saveLibraryState(state: LibraryState) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(state));
}

export default function RuleBuilderPage() {
  const localLibraryItems = useMemo(() => normalizeLocalLibraryItems(), []);
  const [libraryCollapsed, setLibraryCollapsed] = useState(false);
  const [apiStatus, setApiStatus] = useState<ApiStatus>('loading');
  const [storedElements, setStoredElements] = useState<LibraryItem[]>([]);
  const [libraryState, setLibraryState] = useState<LibraryState>(() =>
    createDefaultLibraryState(localLibraryItems)
  );
  const [libraryHydrated, setLibraryHydrated] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedRule, setSelectedRule] = useState<RuleData | null>(null);

  const [publishState, setPublishState] = useState<PublishState>('idle');
  const [publishMessage, setPublishMessage] = useState<string | null>(null);

  const [duplicateRequest, setDuplicateRequest] = useState<{
    requestId: number;
    sourceNodeId: string;
  } | null>(null);

  const [deleteRequest, setDeleteRequest] = useState<{
    requestId: number;
    sourceNodeId: string;
  } | null>(null);

  const [deriveRequest, setDeriveRequest] = useState<{
    requestId: number;
    derivedRule: RuleData;
  } | null>(null);

  const allLibraryItems = useMemo<LibraryItem[]>(
    () => [...localLibraryItems, ...storedElements],
    [localLibraryItems, storedElements]
  );

  const loadStoredRuleElements = useCallback(async () => {
    const items = await listRuleElementsDetailed();

    const mapped: LibraryItem[] = items.map((item) => {
      const itemId = item.item_id || `api:${item.element_id}`;
      const effectiveLabel =
        libraryState.itemLabels[itemId] || item.label || item.element_id;

      return {
        id: itemId,
        type: item.node_type,
        label: effectiveLabel,
        description: item.graph_uri || 'Stored rule element',
        source: 'api',
        element_id: item.element_id,
        template: {
          node_type: item.node_type,
          label: effectiveLabel,
          graph_uri: item.graph_uri || null,
          config: {},
        },
      };
    });

    setStoredElements(mapped);
  }, [libraryState.itemLabels]);

  useEffect(() => {
    const loaded = loadLibraryState(localLibraryItems);
    setLibraryState(loaded);
    setLibraryHydrated(true);
  }, [localLibraryItems]);

    useEffect(() => {
    let active = true;

    async function load() {
      try {
        await getRulesHealth();
        if (!active) return;
        setApiStatus('online');
      } catch (error) {
        console.error('getRulesHealth failed:', error);
        if (!active) return;
        setApiStatus('offline');
      }

      try {
        if (!active) return;

        await ensureExampleRuleElements();

        if (!active) return;

        await loadStoredRuleElements();

        if (!active) return;

        const exampleIds = new Set(EXAMPLE_RULE_ELEMENTS.map((item) => item.id));

        setLibraryState((current) => {
          const nextItemCategory = { ...current.itemCategory };
          const nextItemLabels = { ...current.itemLabels };

          for (const exampleId of exampleIds) {
            const itemId = `api:${exampleId}`;
            nextItemCategory[itemId] = 'examples';

            const example = EXAMPLE_RULE_ELEMENTS.find((item) => item.id === exampleId);
            if (example?.label) {
              nextItemLabels[itemId] = example.label;
            }
          }

          const hasExamplesCategory = current.categories.some(
            (category) => category.id === 'examples'
          );

          return {
            ...current,
            categories: hasExamplesCategory
              ? current.categories
              : [
                  { id: 'examples', label: 'Examples', system: true, order: 0 },
                  ...current.categories,
                ],
            itemCategory: nextItemCategory,
            itemLabels: nextItemLabels,
          };
        });
      } catch (error) {
        console.error('Failed to bootstrap example rule elements:', error);

        if (!active) return;

        try {
          await loadStoredRuleElements();
        } catch (loadError) {
          console.error('listRuleElementsDetailed failed:', loadError);
          if (!active) return;
          setStoredElements([]);
        }
      }
    }

    load();

    return () => {
      active = false;
    };
  }, [loadStoredRuleElements]);

  useEffect(() => {
    setLibraryState((current) => {
      const nextItemCategory = { ...current.itemCategory };
      const nextItemLabels = { ...current.itemLabels };

      for (const item of allLibraryItems) {
        if (!nextItemCategory[item.id]) {
          nextItemCategory[item.id] = 'under-development';
        }
        if (!nextItemLabels[item.id]) {
          nextItemLabels[item.id] = item.label;
        }
      }

      return {
        ...current,
        itemCategory: nextItemCategory,
        itemLabels: nextItemLabels,
      };
    });
  }, [allLibraryItems]);

  useEffect(() => {
    if (!libraryHydrated) return;
    saveLibraryState(libraryState);
  }, [libraryHydrated, libraryState]);

  const categories = useMemo<RuleLibraryCategory[]>(() => {
    const sortedMeta = [...libraryState.categories].sort((a, b) => a.order - b.order);

    return sortedMeta.map((categoryMeta) => {
      const items = allLibraryItems
        .filter((item) => {
          const assignedCategory = libraryState.itemCategory[item.id] || 'under-development';
          return assignedCategory === categoryMeta.id;
        })
        .map((item) => ({
          ...item,
          label: libraryState.itemLabels[item.id] || item.label,
          template: {
            ...item.template,
            label: libraryState.itemLabels[item.id] || item.template.label || item.label,
          },
        }));

      return {
        id: categoryMeta.id,
        label: categoryMeta.label,
        system: categoryMeta.system,
        items,
      };
    });
  }, [allLibraryItems, libraryState]);

  const handleToggleItemSelected = (itemId: string, multi = false) => {
    setSelectedItemIds((current) => {
      if (multi) {
        return current.includes(itemId)
          ? current.filter((id) => id !== itemId)
          : [...current, itemId];
      }

      return current.includes(itemId) && current.length === 1 ? [] : [itemId];
    });
  };

  const handleMoveSelectedToCategory = (categoryId: string) => {
    if (selectedItemIds.length === 0) return;

    setLibraryState((current) => {
      const nextItemCategory = { ...current.itemCategory };
      const nextItemLabels = { ...current.itemLabels };

      for (const itemId of selectedItemIds) {
        const item = allLibraryItems.find((candidate) => candidate.id === itemId);
        if (!item) continue;

        nextItemCategory[itemId] = categoryId;
        nextItemLabels[itemId] = item.label;
      }

      return {
        ...current,
        itemCategory: nextItemCategory,
        itemLabels: nextItemLabels,
      };
    });

    setSelectedItemIds([]);
  };

  const handleMoveSelectedToTrash = () => {
    const apiOnlyIds = selectedItemIds.filter((itemId) => itemId.startsWith('api:'));
    if (apiOnlyIds.length === 0) return;

    setLibraryState((current) => {
      const nextItemCategory = { ...current.itemCategory };
      const nextItemLabels = { ...current.itemLabels };

      for (const itemId of apiOnlyIds) {
        const item = allLibraryItems.find((candidate) => candidate.id === itemId);
        if (!item) continue;

        nextItemCategory[itemId] = 'trash';
        nextItemLabels[itemId] = item.label;
      }

      return {
        ...current,
        itemCategory: nextItemCategory,
        itemLabels: nextItemLabels,
      };
    });

    setSelectedItemIds([]);
  };

  const handleEmptyTrash = async () => {
    const trashedApiItems = allLibraryItems.filter(
      (item) =>
        item.source === 'api' &&
        (libraryState.itemCategory[item.id] || 'under-development') === 'trash' &&
        item.template.graph_uri
    );

    if (trashedApiItems.length === 0) {
      setPublishState('idle');
      setPublishMessage('Waste bin is empty');
      return;
    }

    try {
      setPublishState('saving');
      setPublishMessage('Deleting rule elements from API...');

      await Promise.all(
        trashedApiItems.map((item) =>
          deleteRuleElement({
            graph_uri: item.template.graph_uri as string,
          })
        )
      );

      setLibraryState((current) => {
        const nextItemCategory = { ...current.itemCategory };
        const nextItemLabels = { ...current.itemLabels };

        for (const item of trashedApiItems) {
          delete nextItemCategory[item.id];
          delete nextItemLabels[item.id];
        }

        return {
          ...current,
          itemCategory: nextItemCategory,
          itemLabels: nextItemLabels,
        };
      });

      setSelectedItemIds((current) =>
        current.filter((itemId) => !trashedApiItems.some((item) => item.id === itemId))
      );

      await loadStoredRuleElements();

      setPublishState('success');
      setPublishMessage(`Deleted ${trashedApiItems.length} rule element(s) from API`);
    } catch (error) {
      console.error('deleteRuleElement failed:', error);
      setPublishState('error');
      setPublishMessage(error instanceof Error ? error.message : 'Delete failed');
    }
  };

  const handleCreateCategory = () => {
    const label = window.prompt('New category name');
    if (!label) return;

    const trimmed = label.trim();
    if (!trimmed) return;

    setLibraryState((current) => {
      const existingIds = current.categories.map((category) => category.id);
      const newId = dedupeCategoryId(createCategoryId(trimmed), existingIds);
      const maxOrder = current.categories.reduce(
        (max, category) => Math.max(max, category.order),
        0
      );

      return {
        ...current,
        categories: [
          ...current.categories,
          {
            id: newId,
            label: trimmed,
            system: false,
            order: maxOrder + 1,
          },
        ],
      };
    });
  };

  const handleRenameCategory = (categoryId: string) => {
    setLibraryState((current) => {
      const target = current.categories.find((category) => category.id === categoryId);
      if (!target || target.system) return current;

      const label = window.prompt('Rename category', target.label);
      if (!label) return current;

      const trimmed = label.trim();
      if (!trimmed) return current;

      return {
        ...current,
        categories: current.categories.map((category) =>
          category.id === categoryId
            ? {
                ...category,
                label: trimmed,
              }
            : category
        ),
      };
    });
  };

  const handleSelectedNodeChange = (nodeId: string | null, rule: RuleData | null) => {
    setSelectedNodeId(nodeId);
    setSelectedRule(rule);
    setPublishState('idle');
    setPublishMessage(null);
  };

  const handleInspectorChange = (patch: Partial<RuleData>) => {
    setSelectedRule((current) => {
      if (!current) return current;
      return {
        ...current,
        ...patch,
      };
    });
    setPublishState('idle');
    setPublishMessage(null);
  };

  const handleDuplicateSelectedNode = () => {
    if (!selectedRule || !selectedNodeId) return;

    setDuplicateRequest({
      requestId: Date.now(),
      sourceNodeId: selectedNodeId,
    });

    setPublishState('idle');
    setPublishMessage(null);
  };

  const handleDeleteSelectedNode = () => {
    if (!selectedRule || !selectedNodeId) return;

    setDeleteRequest({
      requestId: Date.now(),
      sourceNodeId: selectedNodeId,
    });

    setPublishState('idle');
    setPublishMessage(null);
  };

  const sourceIdFromGraphUri = (graphUri: string | null | undefined) => {
    if (!graphUri) return null;
    const parts = graphUri.split('/');
    return parts[parts.length - 1] || null;
  };

  const handleDeriveSelectedNode = async () => {
    if (!selectedRule) return;

    const sourceId = sourceIdFromGraphUri(selectedRule.graph_uri);
    if (!sourceId) return;

    try {
      const newId = `${selectedRule.node_type}-${crypto.randomUUID()}`;

      const res = await deriveRuleElement({
        source_id: sourceId,
        new_id: newId,
        preserve_paths: false,
        overrides: {
          label: selectedRule.label || `${sourceId} copy`,
        },
      });

      setDeriveRequest({
        requestId: Date.now(),
        derivedRule: res.rule_element,
      });

      setPublishState('idle');
      setPublishMessage('Derived new local variant from stored element');
    } catch (error) {
      console.error('deriveRuleElement failed:', error);
      setPublishState('error');
      setPublishMessage(error instanceof Error ? error.message : 'Derive failed');
    }
  };

  const handlePublishSelectedNode = async () => {
    if (!selectedRule) return;

    try {
      setPublishState('saving');
      setPublishMessage(null);

      const normalizedLabel = (selectedRule.label || '').trim() || selectedRule.id;

      const payload: RuleData = {
        ...selectedRule,
        label: normalizedLabel,
        graph_uri: null,
        true_path: null,
        false_path: null,
        unknown_path: null,
        value:
          typeof selectedRule.value === 'string' &&
          selectedRule.value.trim() !== '' &&
          !Number.isNaN(Number(selectedRule.value))
            ? Number(selectedRule.value)
            : selectedRule.value,
      };

      const result = await publishRuleElement(payload);

      const publishedId = result.element_id || payload.id;
      const publishedItemId = `api:${publishedId}`;
      const effectiveLabel = payload.label || payload.id;

      setLibraryState((current) => ({
        ...current,
        itemLabels: {
          ...current.itemLabels,
          [publishedItemId]: effectiveLabel,
        },
      }));

      setPublishState('success');
      setPublishMessage(`Published ${effectiveLabel} (${publishedId})`);

      await loadStoredRuleElements();

      setSelectedRule((current) =>
        current
          ? {
              ...current,
              label: effectiveLabel,
              graph_uri: result.graph_uri || null,
            }
          : current
      );
    } catch (error) {
      console.error('publishRuleElement failed:', error);
      setPublishState('error');
      setPublishMessage(error instanceof Error ? error.message : 'Publish failed');
    }
  };

  return (
    <Layout title="RuleBuilder | FireBIM">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">RuleBuilder</h1>
          <p className="text-sm text-gray-500">
            Drag rule nodes from the library into the canvas.
          </p>
        </div>

        <div className="rounded-full border px-3 py-1 text-xs font-medium">
          <span className="mr-2">Rules API</span>
          <span
            className={
              apiStatus === 'online'
                ? 'text-green-600'
                : apiStatus === 'offline'
                ? 'text-red-600'
                : 'text-yellow-600'
            }
          >
            {apiStatus}
          </span>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex h-[75vh] min-h-[600px]">
          <RuleLibraryPanel
            collapsed={libraryCollapsed}
            onToggleCollapsed={() => setLibraryCollapsed((prev) => !prev)}
            categories={categories}
            selectedItemIds={selectedItemIds}
            onToggleItemSelected={handleToggleItemSelected}
            onMoveSelectedToCategory={handleMoveSelectedToCategory}
            onCreateCategory={handleCreateCategory}
            onRenameCategory={handleRenameCategory}
            onMoveSelectedToTrash={handleMoveSelectedToTrash}
            onEmptyTrash={handleEmptyTrash}
          />

          <div className="min-w-0 flex-1 bg-gray-50">
            <RuleCanvas
              selectedNodeId={selectedNodeId}
              onSelectedNodeChange={handleSelectedNodeChange}
              editedRule={selectedRule}
              duplicateRequest={duplicateRequest}
              deleteRequest={deleteRequest}
              deriveRequest={deriveRequest}
            />
          </div>

          <RuleInspectorPanel
            selectedRule={selectedRule}
            onChange={handleInspectorChange}
            onPublish={handlePublishSelectedNode}
            onDuplicate={handleDuplicateSelectedNode}
            onDelete={handleDeleteSelectedNode}
            onDerive={handleDeriveSelectedNode}
            publishState={publishState}
            publishMessage={publishMessage}
          />
        </div>
      </div>
    </Layout>
  );
}
import { useCallback, useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import RuleLibraryPanel from '@/features/rulebuilder/components/RuleLibraryPanel';
import RuleCanvas from '@/features/rulebuilder/components/RuleCanvas';
import RuleInspectorPanel from '@/features/rulebuilder/components/RuleInspectorPanel';
import {
  createCategoryId,
  createDefaultLibraryState,
  DEFAULT_LOCAL_TEMPLATES,
  loadLibraryState,
  saveLibraryState,
} from '@/features/rulebuilder/library';
import {
  deriveRuleElement,
  getRulesHealth,
  listRuleElementsDetailed,
  publishRuleElement,
} from '@/features/rulebuilder/api';
import {
  RuleLibraryCategory,
  RuleLibraryState,
  RuleNodeTemplate,
} from '@/features/rulebuilder/types';

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

export default function RuleBuilderPage() {
  const [libraryCollapsed, setLibraryCollapsed] = useState(false);
  const [apiStatus, setApiStatus] = useState<ApiStatus>('loading');
  const [storedElements, setStoredElements] = useState<RuleNodeTemplate[]>([]);
  const [storedLabelOverrides, setStoredLabelOverrides] = useState<Record<string, string>>({});

  const [libraryState, setLibraryState] = useState<RuleLibraryState>(() =>
    createDefaultLibraryState(DEFAULT_LOCAL_TEMPLATES)
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

  const allLibraryItems = useMemo<RuleNodeTemplate[]>(
    () => [...DEFAULT_LOCAL_TEMPLATES, ...storedElements],
    [storedElements]
  );

  const loadStoredRuleElements = useCallback(async () => {
    const items = await listRuleElementsDetailed();

    const mapped: RuleNodeTemplate[] = items.map((item) => {
      const effectiveLabel =
        storedLabelOverrides[item.element_id] || item.label || item.element_id;

      return {
        id: item.item_id || `api:${item.element_id}`,
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
  }, [storedLabelOverrides]);

  useEffect(() => {
    const loaded = loadLibraryState(DEFAULT_LOCAL_TEMPLATES);
    setLibraryState(loaded);
    setLibraryHydrated(true);
  }, []);

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
        await loadStoredRuleElements();
      } catch (error) {
        console.error('listRuleElementsDetailed failed:', error);
        if (!active) return;
        setStoredElements([]);
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

      for (const item of allLibraryItems) {
        if (!nextItemCategory[item.id]) {
          nextItemCategory[item.id] = 'under-development';
        }
      }

      return {
        ...current,
        itemCategory: nextItemCategory,
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
      const items = allLibraryItems.filter((item) => {
        const assignedCategory = libraryState.itemCategory[item.id] || 'under-development';
        return assignedCategory === categoryMeta.id;
      });

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

      for (const itemId of selectedItemIds) {
        nextItemCategory[itemId] = categoryId;
      }

      return {
        ...current,
        itemCategory: nextItemCategory,
      };
    });

    setSelectedItemIds([]);
  };

  const handleMoveSelectedToTrash = () => {
    handleMoveSelectedToCategory('trash');
  };

  const handleEmptyTrash = () => {
    setLibraryState((current) => {
      const nextItemCategory = { ...current.itemCategory };

      for (const [itemId, categoryId] of Object.entries(nextItemCategory)) {
        if (categoryId === 'trash') {
          delete nextItemCategory[itemId];
        }
      }

      return {
        ...current,
        itemCategory: nextItemCategory,
      };
    });

    setSelectedItemIds((current) =>
      current.filter((itemId) => libraryState.itemCategory[itemId] !== 'trash')
    );
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
      const effectiveLabel = payload.label || payload.id;

      setStoredLabelOverrides((current) => ({
        ...current,
        [publishedId]: effectiveLabel,
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
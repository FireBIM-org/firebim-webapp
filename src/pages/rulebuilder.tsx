import {
  ArchiveBoxArrowDownIcon,
  BookOpenIcon,
  ArrowTopRightOnSquareIcon,
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
  Bars3Icon,
  DocumentDuplicateIcon,
  FolderArrowDownIcon,
  PlayIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import Layout from '@/components/Layout';
import LoadingSpinner from '@/components/LoadingSpinner';
import { env } from '@/config/env';
import {
  EXAMPLE_RULE_ELEMENTS,
  DetailedRuleElementListItem,
  RuleBuilderWorkspace,
  RuleBuilderWorkspacePayload,
  RuleBuilderWorkspaceSummary,
  ensureExampleRuleElements,
  deleteRuleElement,
  deleteRuleBuilderWorkspacesBatch,
  exportRuleBuilderWorkspaceRuleElements,
  getRuleElement,
  getRuleBuilderWorkspace,
  getRulesHealth,
  listRuleBuilderWorkspaces,
  listRules,
  listRuleElementsDetailed,
  publishRuleElement,
  connectRuleElementBranch,
  checkRuleCompleteness,
  publishRule,
  createRuleBuilderWorkspace,
  updateRuleBuilderWorkspace,
} from '@/features/rulebuilder/api';
import {
  buildRuleDraftFromTree,
  buildRuleTreeFromStart,
  detectCyclesInRules,
  validateRuleDraft,
} from '@/features/rulebuilder/buildTree';
import RuleCanvas from '@/features/rulebuilder/components/RuleCanvas';
import RuleInspectorPanel from '@/features/rulebuilder/components/RuleInspectorPanel';
import RuleLibraryPanel from '@/features/rulebuilder/components/RuleLibraryPanel';
import {
  RuleData,
  BuiltTreeResult,
  useRuleBuilderEditor,
} from '@/features/rulebuilder/editorStore';
import { RULE_LIBRARY } from '@/features/rulebuilder/library';
import { RuleLibraryCategory } from '@/features/rulebuilder/types';
import { useRequireAuth } from '@/hooks/useRequireAuth';

type ApiStatus = 'loading' | 'online' | 'offline';
type PublishState = 'idle' | 'saving' | 'success' | 'error';
type BuiltRuleEdgePhase = 'idle' | 'connected' | 'complete';
type WorkspaceActionState = 'idle' | 'saving' | 'success' | 'error';

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
  { id: 'under-development', label: 'Saved Rule element', system: true, order: 10 },
  { id: 'trash', label: 'Waste bin', system: true, order: 999 },
];

function sortCategoryMeta(categories: CategoryMeta[]) {
  return [...categories].sort((a, b) => {
    if (a.id === 'trash') return 1;
    if (b.id === 'trash') return -1;
    return a.order - b.order;
  });
}

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
  const localCategory = RULE_LIBRARY.find(
    (category: RuleLibraryCategory) => category.id === 'under-development',
  );
  const items = localCategory?.items || [];

  return items.map((item: RuleLibraryCategory['items'][number], index: number) => {
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

    const categories = Array.isArray(parsed.categories) ? parsed.categories : DEFAULT_CATEGORY_META;

    const itemCategory =
      parsed.itemCategory && typeof parsed.itemCategory === 'object' ? parsed.itemCategory : {};

    const itemLabels =
      parsed.itemLabels && typeof parsed.itemLabels === 'object' ? parsed.itemLabels : {};

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

function normalizeDuplicateKey(value: string | null | undefined) {
  return (value || '').trim().toLowerCase();
}

function slugifyRuleId(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'rule'
  );
}

function sanitizeRuleLabel(value: string) {
  return value.replace(/"/g, "'").trim() || 'rule';
}

function formatWorkspaceTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

function ensureCategoryMeta(
  categories: CategoryMeta[],
  label: string,
): { categories: CategoryMeta[]; categoryId: string } {
  const trimmed = label.trim();
  const existing = categories.find(
    (category: CategoryMeta) => category.label.trim().toLowerCase() === trimmed.toLowerCase(),
  );

  if (existing) {
    return {
      categories,
      categoryId: existing.id,
    };
  }

  const existingIds = categories.map((category: CategoryMeta) => category.id);
  const newId = dedupeCategoryId(createCategoryId(trimmed), existingIds);
  const maxOrder = categories.reduce(
    (max, category) => (category.id === 'trash' ? max : Math.max(max, category.order)),
    0,
  );

  return {
    categories: [
      ...categories,
      {
        id: newId,
        label: trimmed,
        system: false,
        order: maxOrder + 1,
      },
    ],
    categoryId: newId,
  };
}

function buildNumberedRuleLabel(baseLabel: string, existingLabels: string[]) {
  const normalizedExisting = new Set(existingLabels.map((label) => normalizeDuplicateKey(label)));

  let index = 2;
  let candidate = `${baseLabel} ${index}`;

  while (normalizedExisting.has(normalizeDuplicateKey(candidate))) {
    index += 1;
    candidate = `${baseLabel} ${index}`;
  }

  return candidate;
}

function getDisconnectedRuleIds(allRules: RuleData[], reachableNodeIds: string[]) {
  const reachable = new Set(reachableNodeIds);
  return allRules
    .map((rule: RuleData) => rule.id)
    .filter((ruleId: string) => !reachable.has(ruleId));
}

export default function RuleBuilderPage() {
  const { user, isLoading: authLoading } = useRequireAuth();
  const swaggerDocsUrl = env.apiDocsUrl;
  const localLibraryItems = useMemo(() => normalizeLocalLibraryItems(), []);
  const [libraryCollapsed, setLibraryCollapsed] = useState(false);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [builtTreeCollapsed, setBuiltTreeCollapsed] = useState(false);

  const [builtRuleEdgePhase, setBuiltRuleEdgePhase] = useState<BuiltRuleEdgePhase>('idle');

  const [apiStatus, setApiStatus] = useState<ApiStatus>('loading');
  const [storedElements, setStoredElements] = useState<LibraryItem[]>([]);
  const [libraryState, setLibraryState] = useState<LibraryState>(() =>
    createDefaultLibraryState(localLibraryItems),
  );
  const [libraryHydrated, setLibraryHydrated] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);

  const {
    selectedNodeId,
    selectedRule,
    duplicateRequest,
    deleteRequest,
    deriveRequest,
    buildTreeRequest,
    builtTreeResult,
    canUndo,
    canRedo,
    selectNode,
    updateSelectedRule,
    requestDuplicate,
    requestDelete,
    requestBuildTree,
    setBuiltTreeResult,
    clearBuiltTreeResult,
    undo,
    redo,
  } = useRuleBuilderEditor();

  const [publishState, setPublishState] = useState<PublishState>('idle');
  const [publishMessage, setPublishMessage] = useState<string | null>(null);
  const [rulePublishState, setRulePublishState] = useState<PublishState>('idle');
  const [rulePublishMessage, setRulePublishMessage] = useState<string | null>(null);
  const [buildAndSaveState, setBuildAndSaveState] = useState<PublishState>('idle');
  const [buildAndSaveMessage, setBuildAndSaveMessage] = useState<string | null>(null);
  const [completenessIssueNodeIds, setCompletenessIssueNodeIds] = useState<string[]>([]);
  const [workspaceState, setWorkspaceState] = useState<RuleBuilderWorkspacePayload | null>(null);
  const [activeWorkspace, setActiveWorkspace] = useState<RuleBuilderWorkspaceSummary | null>(null);
  const [workspaceToLoad, setWorkspaceToLoad] = useState<RuleBuilderWorkspace | null>(null);
  const [workspaceList, setWorkspaceList] = useState<RuleBuilderWorkspaceSummary[]>([]);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedWorkspaceIds, setSelectedWorkspaceIds] = useState<string[]>([]);
  const [workspaceActionState, setWorkspaceActionState] = useState<WorkspaceActionState>('idle');
  const [workspaceMessage, setWorkspaceMessage] = useState<string | null>(null);
  const buildAndSaveStateRef = useRef<PublishState>('idle');

  const allLibraryItems = useMemo<LibraryItem[]>(
    () => [...localLibraryItems, ...storedElements],
    [localLibraryItems, storedElements],
  );

  const loadStoredRuleElements = useCallback(async () => {
    const items = await listRuleElementsDetailed();

    const mapped: LibraryItem[] = await Promise.all(
      items.map(async (item: DetailedRuleElementListItem) => {
        const itemId = item.item_id || `api:${item.element_id}`;
        const fallbackLabel = item.label || item.element_id || itemId;

        try {
          const detail = await getRuleElement(item.element_id);
          const ruleElement = detail.rule_element;
          const effectiveLabel = ruleElement.label || fallbackLabel;

          return {
            id: itemId,
            type: ruleElement.element_type,
            label: effectiveLabel,
            description: item.graph_uri || ruleElement.graph_uri || 'Stored rule element',
            source: 'api' as const,
            element_id: item.element_id,
            template: {
              ...ruleElement,
              label: effectiveLabel,
              graph_uri: item.graph_uri || ruleElement.graph_uri || null,
              config: ruleElement.config || {},
            },
          };
        } catch (error) {
          console.error(`Failed to fetch rule element details for ${item.element_id}:`, error);

          return {
            id: itemId,
            type: item.element_type,
            label: fallbackLabel,
            description: item.graph_uri || 'Stored rule element',
            source: 'api' as const,
            element_id: item.element_id,
            template: {
              element_type: item.element_type,
              label: fallbackLabel,
              graph_uri: item.graph_uri || null,
              config: {},
            },
          };
        }
      }),
    );

    setStoredElements(mapped);
  }, []);

  const loadWorkspaceList = useCallback(async () => {
    const response = await listRuleBuilderWorkspaces();
    setWorkspaceList(response.workspaces);
    return response.workspaces;
  }, []);

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
        await loadWorkspaceList();

        if (!active) return;

        const exampleIds = new Set(EXAMPLE_RULE_ELEMENTS.map((item: RuleData) => item.id));

        setLibraryState((current: LibraryState) => {
          const nextItemCategory = { ...current.itemCategory };
          const nextItemLabels = { ...current.itemLabels };

          for (const exampleId of exampleIds) {
            const itemId = `api:${exampleId}`;
            nextItemCategory[itemId] = 'examples';

            const example = EXAMPLE_RULE_ELEMENTS.find((item: RuleData) => item.id === exampleId);
            if (example?.label) {
              nextItemLabels[itemId] = example.label;
            }
          }

          const hasExamplesCategory = current.categories.some(
            (category) => category.id === 'examples',
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
          await loadWorkspaceList();
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
  }, [loadStoredRuleElements, loadWorkspaceList]);

  useEffect(() => {
    setLibraryState((current: LibraryState) => {
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
    const sortedMeta = sortCategoryMeta(libraryState.categories);

    return sortedMeta.map((categoryMeta: CategoryMeta) => {
      const items = allLibraryItems
        .filter((item: LibraryItem) => {
          const assignedCategory = libraryState.itemCategory[item.id] || 'under-development';
          return assignedCategory === categoryMeta.id;
        })
        .map((item: LibraryItem) => ({
          ...item,
          label: libraryState.itemLabels[item.id] || item.label,
          template: {
            ...item.template,
            label: libraryState.itemLabels[item.id] || item.template.label || item.label,
          },
        }))
        .sort((a, b) => {
          const typeOrder: Record<string, number> = {
            start: 0,
            decision: 1,
            end: 2,
          };

          const aOrder = typeOrder[a.type] ?? 999;
          const bOrder = typeOrder[b.type] ?? 999;

          if (aOrder !== bOrder) {
            return aOrder - bOrder;
          }

          return a.label.localeCompare(b.label);
        });
      return {
        id: categoryMeta.id,
        label: categoryMeta.label,
        system: categoryMeta.system,
        items,
      };
    });
  }, [allLibraryItems, libraryState]);

  const workspaceCycles = useMemo(() => {
    if (!workspaceState) {
      return [];
    }

    return detectCyclesInRules(
      workspaceState.nodes.map((node) => ({
        ...node.rule,
      })),
    );
  }, [workspaceState]);

  const canvasNodeCounts = useMemo(() => {
    if (!workspaceState) {
      return {
        start: 0,
        decision: 0,
        end: 0,
      };
    }

    return workspaceState.nodes.reduce(
      (counts, node) => {
        if (node.rule.element_type === 'start') {
          counts.start += 1;
        } else if (node.rule.element_type === 'decision') {
          counts.decision += 1;
        } else if (node.rule.element_type === 'end') {
          counts.end += 1;
        }

        return counts;
      },
      {
        start: 0,
        decision: 0,
        end: 0,
      },
    );
  }, [workspaceState]);

  const canBuildAndSaveRule =
    canvasNodeCounts.start > 0 && canvasNodeCounts.decision > 0 && canvasNodeCounts.end > 0;

  const buildAndSaveButtonClass = useMemo(() => {
    const baseClass =
      'inline-flex items-center gap-2 rounded-md border px-4 py-2 text-xs font-semibold transition-all duration-200';

    if (!canBuildAndSaveRule) {
      return `${baseClass} border-gray-200 bg-gray-100 text-gray-400`;
    }

    if (buildAndSaveState === 'saving') {
      return `${baseClass} border-green-300 bg-green-100 text-green-800 shadow-[0_0_22px_rgba(34,197,94,0.45)] animate-pulse`;
    }

    if (buildAndSaveState === 'error') {
      return `${baseClass} border-red-300 bg-red-50 text-red-700 shadow-[0_0_22px_rgba(239,68,68,0.45)] animate-pulse`;
    }

    if (buildAndSaveState === 'success') {
      return `${baseClass} border-green-400 bg-green-200 text-green-900 shadow-[0_0_18px_rgba(34,197,94,0.35)]`;
    }

    return `${baseClass} border-green-300 bg-green-100 text-green-800 shadow-[0_0_18px_rgba(34,197,94,0.3)] hover:bg-green-200 hover:shadow-[0_0_24px_rgba(34,197,94,0.45)]`;
  }, [buildAndSaveState, canBuildAndSaveRule]);

  useEffect(() => {
    buildAndSaveStateRef.current = buildAndSaveState;
  }, [buildAndSaveState]);

  useEffect(() => {
    if (buildAndSaveStateRef.current === 'saving') {
      return;
    }

    setBuildAndSaveState('idle');
    setBuildAndSaveMessage(null);
  }, [workspaceState]);

  useEffect(() => {
    setCompletenessIssueNodeIds([]);
  }, [workspaceState]);

  const handleToggleItemSelected = (itemId: string, multi = false) => {
    setSelectedItemIds((current: string[]) => {
      if (multi) {
        return current.includes(itemId)
          ? current.filter((id: string) => id !== itemId)
          : [...current, itemId];
      }

      return current.includes(itemId) && current.length === 1 ? [] : [itemId];
    });
  };

  const handleMoveSelectedToCategory = (categoryId: string) => {
    if (selectedItemIds.length === 0) return;

    setLibraryState((current: LibraryState) => {
      const nextItemCategory = { ...current.itemCategory };
      const nextItemLabels = { ...current.itemLabels };

      for (const itemId of selectedItemIds) {
        const item = allLibraryItems.find((candidate: LibraryItem) => candidate.id === itemId);
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
    const apiOnlyIds = selectedItemIds.filter((itemId: string) => itemId.startsWith('api:'));
    if (apiOnlyIds.length === 0) return;

    setLibraryState((current: LibraryState) => {
      const nextItemCategory = { ...current.itemCategory };
      const nextItemLabels = { ...current.itemLabels };

      for (const itemId of apiOnlyIds) {
        const item = allLibraryItems.find((candidate: LibraryItem) => candidate.id === itemId);
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

  const handleHiddenLibraryCommand = useCallback(
    async (command: string) => {
      if (command !== 'delete duplicates') {
        return false;
      }

      const apiItems = storedElements.filter(
        (item: LibraryItem) =>
          (libraryState.itemCategory[item.id] || 'under-development') !== 'trash',
      );
      const duplicatesToTrash: string[] = [];
      const latestByLabel = new Map<string, string>();

      for (const item of apiItems) {
        const displayLabel = libraryState.itemLabels[item.id] || item.label;
        const duplicateKey = normalizeDuplicateKey(displayLabel);

        if (!duplicateKey) continue;

        const previousId = latestByLabel.get(duplicateKey);
        if (previousId) {
          duplicatesToTrash.push(previousId);
        }

        latestByLabel.set(duplicateKey, item.id);
      }

      if (duplicatesToTrash.length === 0) {
        setPublishState('success');
        setPublishMessage('No duplicate stored rule elements were found');
        return true;
      }

      const ok = window.confirm(
        `Move ${duplicatesToTrash.length} older duplicate rule element(s) to the waste bin?`,
      );

      if (!ok) {
        return true;
      }

      const duplicateSet = new Set(duplicatesToTrash);

      setLibraryState((current: LibraryState) => {
        const nextItemCategory = { ...current.itemCategory };
        const nextItemLabels = { ...current.itemLabels };

        for (const itemId of duplicatesToTrash) {
          const item = storedElements.find((candidate: LibraryItem) => candidate.id === itemId);
          if (!item) continue;
          nextItemCategory[itemId] = 'trash';
          nextItemLabels[itemId] = current.itemLabels[itemId] || item.label;
        }

        return {
          ...current,
          itemCategory: nextItemCategory,
          itemLabels: nextItemLabels,
        };
      });

      setSelectedItemIds((current: string[]) =>
        current.filter((itemId: string) => !duplicateSet.has(itemId)),
      );
      setPublishState('success');
      setPublishMessage(
        `Moved ${duplicatesToTrash.length} older duplicate rule element(s) to the waste bin`,
      );
      return true;
    },
    [libraryState.itemCategory, libraryState.itemLabels, storedElements],
  );

  const handleEmptyTrash = async () => {
    const trashedApiItems = allLibraryItems.filter(
      (item: LibraryItem) =>
        item.source === 'api' &&
        (libraryState.itemCategory[item.id] || 'under-development') === 'trash' &&
        item.element_id,
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
        trashedApiItems.map((item: LibraryItem) =>
          deleteRuleElement({
            element_id: item.element_id as string,
          }),
        ),
      );

      setLibraryState((current: LibraryState) => {
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

      setSelectedItemIds((current: string[]) =>
        current.filter(
          (itemId: string) => !trashedApiItems.some((item: LibraryItem) => item.id === itemId),
        ),
      );

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

    setLibraryState((current: LibraryState) => {
      const { categories } = ensureCategoryMeta(current.categories, trimmed);
      return {
        ...current,
        categories,
      };
    });
  };

  const handleRenameCategory = (categoryId: string) => {
    setLibraryState((current: LibraryState) => {
      const target = current.categories.find(
        (category: CategoryMeta) => category.id === categoryId,
      );
      if (!target || target.system) return current;

      const label = window.prompt('Rename category', target.label);
      if (!label) return current;

      const trimmed = label.trim();
      if (!trimmed) return current;

      return {
        ...current,
        categories: current.categories.map((category: CategoryMeta) =>
          category.id === categoryId
            ? {
                ...category,
                label: trimmed,
              }
            : category,
        ),
      };
    });
  };

  const buildCurrentRulesetDraft = () => {
    if (!builtTreeResult) return null;
    const entryNode = builtTreeResult.nodes.find(
      (node: BuiltTreeResult['nodes'][number]) => node.id === builtTreeResult.entry,
    );
    const ruleLabel = sanitizeRuleLabel(
      entryNode?.label?.trim() || selectedRule?.label?.trim() || selectedRule?.id || 'rule',
    );
    const baseId = slugifyRuleId(ruleLabel);

    return buildRuleDraftFromTree(baseId, builtTreeResult, ruleLabel);
  };

  const handleConnectBuiltTree = async () => {
    const draft = buildCurrentRulesetDraft();
    if (!draft || !builtTreeResult) return;
    const validationIssues = validateRuleDraft(draft);

    if (builtTreeResult.missingBranches.length > 0) {
      setRulePublishState('error');
      setRulePublishMessage('Cannot connect rule: missing branch targets were found');
      return;
    }

    if (workspaceCycles.length > 0) {
      setRulePublishState('error');
      setRulePublishMessage('Cannot connect rule: loop(s) were detected in the current workspace');
      return;
    }

    if (validationIssues.length > 0) {
      const issue = validationIssues[0];
      setRulePublishState('error');
      setRulePublishMessage(
        `Cannot connect rule: decision node "${issue.node_id}" is missing ${issue.missing_fields.join(', ')}`,
      );
      return;
    }

    try {
      setRulePublishState('saving');
      setRulePublishMessage('Connecting rule element branches...');

      for (const connection of builtTreeResult.connections) {
        await connectRuleElementBranch({
          rule: draft,
          source_id: connection.source_id,
          branch: connection.branch,
          target_id: connection.target_id,
        });
      }

      setBuiltRuleEdgePhase('connected');

      setRulePublishState('success');
      setRulePublishMessage(`Connected ${builtTreeResult.connections.length} branch connection(s)`);
    } catch (error) {
      console.error('connectRuleElementBranch failed:', error);
      setRulePublishState('error');
      setRulePublishMessage(error instanceof Error ? error.message : 'Connect failed');
    }
  };

  const handleCheckBuiltRuleCompleteness = async () => {
    const draft = buildCurrentRulesetDraft();
    if (!draft) return;
    const validationIssues = validateRuleDraft(draft);
    setCompletenessIssueNodeIds([]);

    if (validationIssues.length > 0) {
      const issue = validationIssues[0];
      setRulePublishState('error');
      setRulePublishMessage(
        `Cannot check completeness: decision node "${issue.node_id}" is missing ${issue.missing_fields.join(', ')}`,
      );
      return;
    }

    try {
      setRulePublishState('saving');
      setRulePublishMessage('Checking rule completeness...');

      const result = await checkRuleCompleteness({
        rule: draft,
      });

      const completenessIds = new Set<string>();

      for (const nodeId of result.missing_nodes || []) {
        if (draft.elements.some((element) => element.id === nodeId)) {
          completenessIds.add(nodeId);
        }
      }

      for (const branch of result.open_branches || []) {
        if (typeof branch.node_id === 'string' && branch.node_id.trim()) {
          completenessIds.add(branch.node_id);
        }
      }

      if (result.entry_ok === false && builtTreeResult?.entry) {
        completenessIds.add(builtTreeResult.entry);
      }

      setCompletenessIssueNodeIds([...completenessIds]);

      if (result?.complete === true) {
        setBuiltRuleEdgePhase('complete');
        setRulePublishState('success');
        setRulePublishMessage('Completeness check finished: rule is complete');
      } else {
        setBuiltRuleEdgePhase('connected');
        setRulePublishState('success');
        setRulePublishMessage(`Completeness check finished: ${JSON.stringify(result)}`);
      }
    } catch (error) {
      console.error('checkRuleCompleteness failed:', error);
      setRulePublishState('error');
      setRulePublishMessage(error instanceof Error ? error.message : 'Completeness check failed');
    }
  };

  const handlePublishBuiltRule = async () => {
    const draft = buildCurrentRulesetDraft();
    if (!draft) return;
    const validationIssues = validateRuleDraft(draft);

    if (builtTreeResult?.missingBranches.length) {
      setRulePublishState('error');
      setRulePublishMessage('Cannot publish rule: missing branch targets were found');
      return;
    }

    if (builtTreeResult?.cycles.length) {
      setRulePublishState('error');
      setRulePublishMessage('Cannot publish rule: cycle(s) were detected');
      return;
    }

    if (workspaceCycles.length > 0) {
      setRulePublishState('error');
      setRulePublishMessage('Cannot publish rule: loop(s) were detected in the current workspace');
      return;
    }

    if (validationIssues.length > 0) {
      const issue = validationIssues[0];
      setRulePublishState('error');
      setRulePublishMessage(
        `Cannot publish rule: decision node "${issue.node_id}" is missing ${issue.missing_fields.join(', ')}`,
      );
      return;
    }

    try {
      setRulePublishState('saving');
      setRulePublishMessage('Saving rule...');

      const baseRuleLabel = draft.label?.trim() || draft.id;
      const sanitizedBaseRuleLabel = sanitizeRuleLabel(baseRuleLabel);
      const existingRules = await listRules();
      const matchingLabels = existingRules
        .map((rule: { label?: string | null }) => rule.label?.trim())
        .filter(
          (label): label is string =>
            Boolean(label) &&
            normalizeDuplicateKey(label) === normalizeDuplicateKey(sanitizedBaseRuleLabel),
        );

      let resolvedRuleLabel = sanitizedBaseRuleLabel;

      if (matchingLabels.length > 0) {
        const shouldOverride = window.confirm(
          `A rule named "${sanitizedBaseRuleLabel}" already exists in the RuleBook. Do you want to keep that same label?`,
        );

        if (!shouldOverride) {
          resolvedRuleLabel = buildNumberedRuleLabel(
            sanitizedBaseRuleLabel,
            existingRules
              .map((rule: { label?: string | null }) => rule.label)
              .filter((label): label is string => Boolean(label)),
          );
        }
      }

      const publishDraft = {
        ...draft,
        id: slugifyRuleId(resolvedRuleLabel),
        label: resolvedRuleLabel,
      };

      const result = await publishRule({
        rule: publishDraft,
      });

      setRulePublishState('success');
      const publishedRuleId = result.rule_id || publishDraft.id;
      setRulePublishMessage(
        `The rule "${publishedRuleId}" is saved and can now be found in the rulebook`,
      );
    } catch (error) {
      console.error('publishRule failed:', error);
      setRulePublishState('error');
      setRulePublishMessage(error instanceof Error ? error.message : 'Rule publish failed');
    }
  };

  const handleBuildAndSaveRule = async () => {
    clearBuiltTreeResult();
    setBuiltTreeCollapsed(false);
    setBuiltRuleEdgePhase('idle');
    setRulePublishState('idle');
    setRulePublishMessage(null);

    if (!workspaceState) {
      const message =
        'No workspace is ready to build. Add start, decision and end nodes to the canvas.';
      setBuildAndSaveState('error');
      setBuildAndSaveMessage(message);
      setRulePublishState('error');
      setRulePublishMessage(message);
      return;
    }

    const startNodes = workspaceState.nodes.filter((node) => node.rule.element_type === 'start');

    if (startNodes.length !== 1) {
      const message =
        startNodes.length > 1
          ? 'can only build with one start node on canvas'
          : 'Cannot build rule: add one start node to the canvas first';
      setBuildAndSaveState('error');
      setBuildAndSaveMessage(message);
      setRulePublishState('error');
      setRulePublishMessage(message);
      return;
    }

    const startNode = startNodes[0];
    const rules = workspaceState.nodes.map((node) => ({
      ...node.rule,
    }));

    setBuildAndSaveState('saving');
    setBuildAndSaveMessage('Building and saving rule...');
    setRulePublishState('saving');
    setRulePublishMessage('Selecting start node...');
    selectNode(startNode.canvas_node_id, startNode.rule);

    const builtTree = buildRuleTreeFromStart(startNode.rule.id, rules);
    setBuiltTreeResult(builtTree);
    const disconnectedRuleIds = getDisconnectedRuleIds(rules, builtTree.reachableNodeIds);

    if (builtTree.missingBranches.length > 0) {
      const message = `Cannot build rule: ${builtTree.missingBranches.length} missing branch target(s) were found`;
      setBuildAndSaveState('error');
      setBuildAndSaveMessage(message);
      setRulePublishState('error');
      setRulePublishMessage(message);
      return;
    }

    if (disconnectedRuleIds.length > 0) {
      const message =
        disconnectedRuleIds.length === 1
          ? `Cannot build rule: 1 rule element is not connected to the selected start node (${disconnectedRuleIds[0]})`
          : `Cannot build rule: ${disconnectedRuleIds.length} rule elements are not connected to the selected start node`;
      setBuildAndSaveState('error');
      setBuildAndSaveMessage(message);
      setRulePublishState('error');
      setRulePublishMessage(message);
      return;
    }

    if (builtTree.cycles.length > 0 || workspaceCycles.length > 0) {
      const message = 'Cannot build rule: loop(s) were detected in the current workspace';
      setBuildAndSaveState('error');
      setBuildAndSaveMessage(message);
      setRulePublishState('error');
      setRulePublishMessage(message);
      return;
    }

    const entryNode = builtTree.nodes.find(
      (node: BuiltTreeResult['nodes'][number]) => node.id === builtTree.entry,
    );
    const ruleLabel = sanitizeRuleLabel(
      entryNode?.label?.trim() || startNode.rule.label?.trim() || startNode.rule.id || 'rule',
    );
    const draft = buildRuleDraftFromTree(slugifyRuleId(ruleLabel), builtTree, ruleLabel);
    const validationIssues = validateRuleDraft(draft);

    if (validationIssues.length > 0) {
      const issue = validationIssues[0];
      const message = `Cannot build rule: decision node "${issue.node_id}" is missing ${issue.missing_fields.join(', ')}`;
      setBuildAndSaveState('error');
      setBuildAndSaveMessage(message);
      setRulePublishState('error');
      setRulePublishMessage(message);
      return;
    }

    try {
      setRulePublishMessage('Connecting rule element branches...');

      for (const connection of builtTree.connections) {
        await connectRuleElementBranch({
          rule: draft,
          source_id: connection.source_id,
          branch: connection.branch,
          target_id: connection.target_id,
        });
      }

      setBuiltRuleEdgePhase('connected');
      setRulePublishMessage('Checking rule completeness...');

      const completeness = await checkRuleCompleteness({
        rule: draft,
      });

      if (completeness?.complete !== true) {
        throw new Error(
          completeness
            ? `Completeness check failed: ${JSON.stringify(completeness)}`
            : 'Completeness check failed',
        );
      }

      setBuiltRuleEdgePhase('complete');
      setRulePublishMessage('Saving rule...');

      const baseRuleLabel = draft.label?.trim() || draft.id;
      const sanitizedBaseRuleLabel = sanitizeRuleLabel(baseRuleLabel);
      const existingRules = await listRules();
      const matchingLabels = existingRules
        .map((rule: { label?: string | null }) => rule.label?.trim())
        .filter(
          (label): label is string =>
            Boolean(label) &&
            normalizeDuplicateKey(label) === normalizeDuplicateKey(sanitizedBaseRuleLabel),
        );

      let resolvedRuleLabel = sanitizedBaseRuleLabel;

      if (matchingLabels.length > 0) {
        const shouldOverride = window.confirm(
          `A rule named "${sanitizedBaseRuleLabel}" already exists in the RuleBook. Do you want to keep that same label?`,
        );

        if (!shouldOverride) {
          resolvedRuleLabel = buildNumberedRuleLabel(
            sanitizedBaseRuleLabel,
            existingRules
              .map((rule: { label?: string | null }) => rule.label?.trim())
              .filter((label): label is string => Boolean(label)),
          );
        }
      }

      const publishDraft = {
        ...draft,
        id: slugifyRuleId(resolvedRuleLabel),
        label: resolvedRuleLabel,
      };

      const result = await publishRule({
        rule: publishDraft,
      });

      const publishedRuleId = result.rule_id || publishDraft.id;
      const successMessage = `The rule "${publishedRuleId}" is saved and can now be found in the rulebook`;

      setBuildAndSaveState('success');
      setBuildAndSaveMessage(successMessage);
      setRulePublishState('success');
      setRulePublishMessage(successMessage);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Build and save failed';
      console.error('handleBuildAndSaveRule failed:', error);
      setBuildAndSaveState('error');
      setBuildAndSaveMessage(message);
      setRulePublishState('error');
      setRulePublishMessage(message);
    }
  };

  const handleSelectedNodeChange = (nodeId: string | null, rule: RuleData | null) => {
    selectNode(nodeId, rule);
    setPublishState('idle');
    setPublishMessage(null);
  };

  const toggleWorkspaceSelected = (workspaceId: string) => {
    setSelectedWorkspaceIds((current: string[]) =>
      current.includes(workspaceId)
        ? current.filter((id: string) => id !== workspaceId)
        : [...current, workspaceId],
    );
  };

  const ensureWorkspaceState = () => {
    if (workspaceState) {
      return workspaceState;
    }

    throw new Error(
      'No workspace is ready to save. Add at least one start rule element to the canvas.',
    );
  };

  const promptWorkspaceName = (fallbackName: string) => {
    const enteredName = window.prompt('Workspace name', fallbackName);
    if (enteredName === null) return null;
    return enteredName.trim() || fallbackName;
  };

  const createWorkspaceSummary = (
    workspace: RuleBuilderWorkspace,
  ): RuleBuilderWorkspaceSummary => ({
    id: workspace.id,
    name: workspace.name,
    entry_node_id: workspace.entry_node_id,
    entry_node_label: workspace.entry_node_label,
    created_at: workspace.created_at,
    updated_at: workspace.updated_at,
    node_count: workspace.nodes.length,
    edge_count: workspace.edges.length,
  });

  const createWorkspaceWithPrompt = async () => {
    const currentState = ensureWorkspaceState();
    const requestedName = promptWorkspaceName(currentState.entry_node_label || currentState.name);
    if (!requestedName) {
      return null;
    }

    setWorkspaceActionState('saving');
    setWorkspaceMessage(null);

    const response = await createRuleBuilderWorkspace({
      ...currentState,
      name: requestedName,
      entry_node_label: currentState.entry_node_label || requestedName,
    });

    setActiveWorkspace(createWorkspaceSummary(response.workspace));
    setWorkspaceToLoad(response.workspace);
    await loadWorkspaceList();
    setWorkspaceActionState('success');
    setWorkspaceMessage(`Workspace "${response.workspace.name}" saved`);
    return response.workspace;
  };

  const handleSaveWorkspaceAs = async () => {
    try {
      await createWorkspaceWithPrompt();
    } catch (error) {
      console.error('createRuleBuilderWorkspace failed:', error);
      setWorkspaceActionState('error');
      setWorkspaceMessage(error instanceof Error ? error.message : 'Save as failed');
    }
  };

  const handleSaveWorkspace = async () => {
    try {
      if (!activeWorkspace?.id) {
        await createWorkspaceWithPrompt();
        return;
      }

      const currentState = ensureWorkspaceState();
      setWorkspaceActionState('saving');
      setWorkspaceMessage(null);

      const response = await updateRuleBuilderWorkspace(activeWorkspace.id, {
        ...currentState,
        name: activeWorkspace.name,
      });

      setActiveWorkspace(createWorkspaceSummary(response.workspace));
      await loadWorkspaceList();
      setWorkspaceActionState('success');
      setWorkspaceMessage(`Workspace "${response.workspace.name}" updated`);
    } catch (error) {
      console.error('updateRuleBuilderWorkspace failed:', error);
      setWorkspaceActionState('error');
      setWorkspaceMessage(error instanceof Error ? error.message : 'Save failed');
    }
  };

  const handleOpenLoadDialog = async () => {
    try {
      setShowDeleteDialog(false);
      setSelectedWorkspaceIds([]);
      await loadWorkspaceList();
      setShowLoadDialog(true);
    } catch (error) {
      console.error('listRuleBuilderWorkspaces failed:', error);
      setWorkspaceActionState('error');
      setWorkspaceMessage(error instanceof Error ? error.message : 'Load list failed');
    }
  };

  const handleLoadWorkspace = async (workspaceId: string) => {
    try {
      setWorkspaceActionState('saving');
      setWorkspaceMessage(null);
      const response = await getRuleBuilderWorkspace(workspaceId);
      setWorkspaceToLoad(response.workspace);
      setActiveWorkspace(createWorkspaceSummary(response.workspace));
      setShowLoadDialog(false);
      setWorkspaceActionState('success');
      setWorkspaceMessage(`Workspace "${response.workspace.name}" loaded`);
    } catch (error) {
      console.error('getRuleBuilderWorkspace failed:', error);
      setWorkspaceActionState('error');
      setWorkspaceMessage(error instanceof Error ? error.message : 'Load failed');
    }
  };

  const handleOpenDeleteDialog = async () => {
    try {
      setShowLoadDialog(false);
      setSelectedWorkspaceIds([]);
      await loadWorkspaceList();
      setShowDeleteDialog(true);
    } catch (error) {
      console.error('listRuleBuilderWorkspaces failed:', error);
      setWorkspaceActionState('error');
      setWorkspaceMessage(error instanceof Error ? error.message : 'Delete list failed');
    }
  };

  const handleDeleteSelectedWorkspaces = async () => {
    if (selectedWorkspaceIds.length === 0) {
      setWorkspaceActionState('error');
      setWorkspaceMessage('Select at least one workspace to delete');
      return;
    }

    try {
      setWorkspaceActionState('saving');
      setWorkspaceMessage(null);
      const response = await deleteRuleBuilderWorkspacesBatch(selectedWorkspaceIds);
      if (activeWorkspace && response.deleted_ids.includes(activeWorkspace.id)) {
        setActiveWorkspace(null);
      }
      setSelectedWorkspaceIds([]);
      await loadWorkspaceList();
      setShowDeleteDialog(false);
      setWorkspaceActionState('success');
      setWorkspaceMessage(
        response.not_found_ids.length > 0
          ? `Deleted ${response.deleted_ids.length} workspace(s); ${response.not_found_ids.length} were not found`
          : `Deleted ${response.deleted_ids.length} workspace(s)`,
      );
    } catch (error) {
      console.error('deleteRuleBuilderWorkspacesBatch failed:', error);
      setWorkspaceActionState('error');
      setWorkspaceMessage(error instanceof Error ? error.message : 'Delete failed');
    }
  };

  const handleExportWorkspaceRuleElements = async () => {
    try {
      let workspaceId = activeWorkspace?.id || null;

      if (!workspaceId) {
        const createdWorkspace = await createWorkspaceWithPrompt();
        workspaceId = createdWorkspace?.id || null;
      }

      if (!workspaceId) {
        return;
      }

      setWorkspaceActionState('saving');
      setWorkspaceMessage(null);
      const response = await exportRuleBuilderWorkspaceRuleElements(workspaceId);
      await loadStoredRuleElements();
      const categoryLabel = response.entry_node_label?.trim() || response.group_name?.trim();
      const currentWorkspace = workspaceState;
      const workspaceLabelsByRuleId = new Map<string, string>();

      if (currentWorkspace) {
        for (const node of currentWorkspace.nodes) {
          const ruleId = node.rule.id;
          const label = node.rule.label?.trim() || ruleId;
          workspaceLabelsByRuleId.set(ruleId, label);
        }
      }

      if (categoryLabel) {
        setLibraryState((current: LibraryState) => {
          const ensured = ensureCategoryMeta(current.categories, categoryLabel);
          const nextItemCategory = { ...current.itemCategory };
          const nextItemLabels = { ...current.itemLabels };

          for (const element of response.elements) {
            const itemId = `api:${element.element_id}`;
            nextItemCategory[itemId] = ensured.categoryId;
            nextItemLabels[itemId] =
              workspaceLabelsByRuleId.get(element.source_id) ||
              nextItemLabels[itemId] ||
              element.source_id ||
              itemId;
          }

          return {
            ...current,
            categories: ensured.categories,
            itemCategory: nextItemCategory,
            itemLabels: nextItemLabels,
          };
        });
      }

      setWorkspaceActionState('success');
      setWorkspaceMessage(
        `Saved ${response.created_count} rule element(s) to "${response.group_name}"`,
      );
    } catch (error) {
      console.error('exportRuleBuilderWorkspaceRuleElements failed:', error);
      setWorkspaceActionState('error');
      setWorkspaceMessage(
        error instanceof Error ? error.message : 'Save all rule elements to library failed',
      );
    }
  };

  const handleInspectorChange = (patch: Partial<RuleData>) => {
    updateSelectedRule(patch);
    setPublishState('idle');
    setPublishMessage(null);
  };

  const handleDeleteSelectedNode = () => {
    if (!selectedRule || !selectedNodeId) return;

    requestDelete(selectedNodeId);

    setPublishState('idle');
    setPublishMessage(null);
  };

  const handleDuplicateSelectedNode = () => {
    if (!selectedRule || !selectedNodeId) return;

    requestDuplicate(selectedNodeId);

    setPublishState('idle');
    setPublishMessage(null);
  };

  const handleBuildTreeFromSelectedStartNode = () => {
    if (!selectedRule || !selectedNodeId) return;
    if (selectedRule.element_type !== 'start') return;

    clearBuiltTreeResult();
    setBuiltRuleEdgePhase('idle');
    requestBuildTree(selectedNodeId);

    setPublishState('idle');
    setPublishMessage('Building Rule from selected start rule element...');
  };

  const handleTreeBuilt = (result: BuiltTreeResult) => {
    setBuiltTreeResult(result);
    setBuiltTreeCollapsed(false);

    const currentRules =
      workspaceState?.nodes.map((node) => ({
        ...node.rule,
      })) || [];
    const disconnectedRuleIds = getDisconnectedRuleIds(currentRules, result.reachableNodeIds);

    if (result.missingBranches.length > 0) {
      setPublishState('error');
      setPublishMessage(
        `Rule built, but ${result.missingBranches.length} missing target(s) were found`,
      );
      return;
    }

    if (result.cycles.length > 0) {
      setPublishState('error');
      setPublishMessage(`Tree built, but ${result.cycles.length} cycle(s) were detected`);
      return;
    }

    if (disconnectedRuleIds.length > 0) {
      setPublishState('error');
      setPublishMessage(
        disconnectedRuleIds.length === 1
          ? `Tree built, but 1 rule element is not connected to the selected start node (${disconnectedRuleIds[0]})`
          : `Tree built, but ${disconnectedRuleIds.length} rule elements are not connected to the selected start node`,
      );
      return;
    }

    if (workspaceCycles.length > 0) {
      setPublishState('error');
      setPublishMessage(
        `Tree built, but ${workspaceCycles.length} loop(s) were detected in the current workspace`,
      );
      return;
    }

    setPublishState('success');
    setPublishMessage(
      `Built Rule with ${result.reachableNodeIds.length} rule elements and ${result.connections.length} connection(s)`,
    );
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
        element_id: null,
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

      setLibraryState((current: LibraryState) => ({
        ...current,
        itemLabels: {
          ...current.itemLabels,
          [publishedItemId]: effectiveLabel,
        },
      }));

      setPublishState('success');
      setPublishMessage(`Published ${effectiveLabel} (${publishedId})`);

      await loadStoredRuleElements();

      updateSelectedRule({
        label: effectiveLabel,
        graph_uri: result.graph_uri || null,
        element_id: publishedId,
      });
    } catch (error) {
      console.error('publishRuleElement failed:', error);
      setPublishState('error');
      setPublishMessage(error instanceof Error ? error.message : 'Publish failed');
    }
  };

  if (authLoading || !user) {
    return (
      <Layout title="Loading... | FireBIM">
        <LoadingSpinner />
      </Layout>
    );
  }

  return (
    <Layout title="RuleBuilder | FireBIM">
      <div className="rule-workspace-frame">
        <div className="rule-workspace-frame-header">
          <div className="rule-workspace-frame-header-row">
            <div>
              <div className="rule-workspace-header">RuleBuilder</div>
              <div className="text-xs text-gray-500">
                Drag rule elements into the canvas and compose rules visually
              </div>
            </div>

            <div className="rule-workspace-api-slot">
              <button
                type="button"
                onClick={handleDuplicateSelectedNode}
                disabled={!selectedRule}
                className="rounded-md border border-gray-200 p-2 text-gray-600 hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
                title="Duplicate selected rule element"
                aria-label="Duplicate selected rule element"
              >
                <DocumentDuplicateIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleDeleteSelectedNode}
                disabled={!selectedRule}
                className="rounded-md border border-gray-200 p-2 text-gray-600 hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
                title="Delete selected rule element"
                aria-label="Delete selected rule element"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  void handlePublishSelectedNode();
                }}
                disabled={!selectedRule || publishState === 'saving'}
                className="rounded-md border border-gray-200 p-2 text-gray-600 hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
                title="Save selected ruleelement"
                aria-label="Save selected ruleelement"
              >
                <ArchiveBoxArrowDownIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={undo}
                disabled={!canUndo}
                className="rounded-md border border-gray-200 p-2 text-gray-600 hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
                title="Undo"
                aria-label="Undo"
              >
                <ArrowUturnLeftIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={redo}
                disabled={!canRedo}
                className="rounded-md border border-gray-200 p-2 text-gray-600 hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
                title="Redo"
                aria-label="Redo"
              >
                <ArrowUturnRightIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleSaveWorkspaceAs();
                }}
                className="rounded-md border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                title="Save as, all rule elements is in canvas"
              >
                Save as
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleSaveWorkspace();
                }}
                className="rounded-md border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                title="Save, all rule elements is in canvas"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleOpenLoadDialog();
                }}
                className="inline-flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                title="Load, all rule elements is in canvas"
              >
                <FolderArrowDownIcon className="h-4 w-4" />
                Load
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleOpenDeleteDialog();
                }}
                className="inline-flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                title="Delete previous saves"
              >
                <TrashIcon className="h-4 w-4" />
                Delete
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleExportWorkspaceRuleElements();
                }}
                className="inline-flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                title="Save all rule elements to rule elements library"
              >
                <ArchiveBoxArrowDownIcon className="h-4 w-4" />
                Save all
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleBuildAndSaveRule();
                }}
                disabled={!canBuildAndSaveRule || buildAndSaveState === 'saving'}
                className={buildAndSaveButtonClass}
                title="Build, connect, check completeness, and save the rule."
              >
                <PlayIcon className="h-4 w-4" />
                {buildAndSaveState === 'saving' ? 'Building...' : 'Build and save rule'}
              </button>

              <a
                href={swaggerDocsUrl}
                target="_blank"
                rel="noreferrer"
                className="rule-workspace-api-link"
                title="Open Swagger docs"
              >
                <span className={apiStatus === 'online' ? 'text-green-600' : 'text-red-600'}>
                  {apiStatus === 'online' ? 'API online' : 'API offline'}
                </span>
                <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5 text-gray-500" />
              </a>
            </div>
          </div>
        </div>

        <div className="flex h-[75vh] min-h-[600px]">
          <RuleLibraryPanel
            collapsed={libraryCollapsed}
            onToggleCollapsed={() => setLibraryCollapsed((prev: boolean) => !prev)}
            categories={categories}
            selectedItemIds={selectedItemIds}
            onToggleItemSelected={handleToggleItemSelected}
            onMoveSelectedToCategory={handleMoveSelectedToCategory}
            onCreateCategory={handleCreateCategory}
            onRenameCategory={handleRenameCategory}
            onMoveSelectedToTrash={handleMoveSelectedToTrash}
            onEmptyTrash={handleEmptyTrash}
            onRefresh={() => {
              void loadStoredRuleElements();
            }}
            onHiddenSearchCommand={handleHiddenLibraryCommand}
          />

          <div className="min-w-0 flex-1 bg-gray-50">
            <RuleCanvas
              selectedNodeId={selectedNodeId}
              onSelectedNodeChange={handleSelectedNodeChange}
              editedRule={selectedRule}
              duplicateRequest={duplicateRequest}
              deleteRequest={deleteRequest}
              deriveRequest={deriveRequest}
              buildTreeRequest={buildTreeRequest}
              onTreeBuilt={handleTreeBuilt}
              builtRuleEdgePhase={builtRuleEdgePhase}
              workspaceToLoad={workspaceToLoad}
              onWorkspaceStateChange={setWorkspaceState}
              completenessIssueNodeIds={completenessIssueNodeIds}
            />
          </div>

          <RuleInspectorPanel
            collapsed={inspectorCollapsed}
            onToggleCollapsed={() => setInspectorCollapsed((prev: boolean) => !prev)}
            selectedRule={selectedRule}
            onChange={handleInspectorChange}
            onBuildTree={handleBuildTreeFromSelectedStartNode}
          />

          {builtTreeResult ? (
            builtTreeCollapsed ? (
              <aside className="flex w-10 flex-col items-center border-l border-gray-200 bg-white py-2">
                <button
                  type="button"
                  onClick={() => setBuiltTreeCollapsed(false)}
                  className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                  title="Expand rule details"
                >
                  <Bars3Icon className="h-5 w-5" />
                </button>
              </aside>
            ) : (
              <aside className="flex h-full w-80 flex-col border-l border-gray-200 bg-white p-4 text-sm">
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <div className="mb-4 flex items-start justify-between">
                    <div>
                      <h3 className="rule-workspace-header">Rule details</h3>
                      <p className="text-xs text-gray-500">Built tree summary</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setBuiltTreeCollapsed(true)}
                      className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                      title="Collapse rule details"
                    >
                      <Bars3Icon className="h-5 w-5" />
                    </button>
                  </div>

                  <p className="mb-2 text-gray-600">
                    Entry: <span className="font-mono">{builtTreeResult.entry}</span>
                  </p>

                  <p className="mb-3 text-gray-600">
                    Nodes: {builtTreeResult.reachableNodeIds.length}
                  </p>

                  <div className="mb-3">
                    <div className="mb-1 font-medium text-gray-800">Connections</div>
                    <div className="max-h-24 overflow-y-auto rounded border bg-gray-50 p-2 font-mono text-xs whitespace-nowrap">
                      {builtTreeResult.connections.length > 0 ? (
                        builtTreeResult.connections.map((c, i) => (
                          <div key={i}>
                            {c.source_id}.{c.branch} → {c.target_id}
                          </div>
                        ))
                      ) : (
                        <div className="text-gray-400">No connections</div>
                      )}
                    </div>
                  </div>

                  {builtTreeResult.missingBranches.length > 0 && (
                    <div className="mb-3">
                      <div className="mb-1 font-medium text-red-700">Missing branches</div>
                      <div className="space-y-1 rounded border border-red-200 bg-red-50 p-2 font-mono text-xs">
                        {builtTreeResult.missingBranches.map((m, i) => (
                          <div key={i}>
                            {m.source_id}.{m.branch} → {m.missing_target_id} ❌
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {(builtTreeResult.cycles.length > 0 || workspaceCycles.length > 0) && (
                    <div className="mb-3">
                      <div className="mb-1 font-medium text-red-700">Loops</div>
                      <div className="rounded border border-red-200 bg-red-50 p-2 text-xs">
                        {builtTreeResult.cycles.map((cycle, i) => (
                          <div key={i} className="font-mono">
                            {cycle.join(' → ')}
                          </div>
                        ))}
                        {workspaceCycles
                          .filter(
                            (cycle) =>
                              !builtTreeResult.cycles.some(
                                (builtCycle) => builtCycle.join('|') === cycle.join('|'),
                              ),
                          )
                          .map((cycle, i) => (
                            <div
                              key={`workspace-${cycle.join('|')}-${i}`}
                              className="font-mono text-red-700"
                            >
                              {cycle.join(' → ')}
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => {
                        clearBuiltTreeResult();
                        setBuiltRuleEdgePhase('idle');
                        setRulePublishState('idle');
                        setRulePublishMessage(null);
                      }}
                      className="w-full rounded border px-3 py-1 text-sm"
                    >
                      Clear
                    </button>

                    <button
                      type="button"
                      onClick={handleConnectBuiltTree}
                      disabled={
                        !builtTreeResult ||
                        builtTreeResult.connections.length === 0 ||
                        builtTreeResult.missingBranches.length > 0 ||
                        workspaceCycles.length > 0
                      }
                      className="w-full rounded border border-blue-300 px-3 py-1 text-sm text-blue-700 disabled:opacity-50"
                    >
                      Connect rule branches
                    </button>

                    <button
                      type="button"
                      onClick={handleCheckBuiltRuleCompleteness}
                      disabled={!builtTreeResult}
                      className="w-full rounded border border-amber-300 px-3 py-1 text-sm text-amber-700 disabled:opacity-50"
                    >
                      Check completeness
                    </button>

                    <button
                      type="button"
                      onClick={handlePublishBuiltRule}
                      disabled={
                        !builtTreeResult ||
                        builtTreeResult.missingBranches.length > 0 ||
                        builtTreeResult.cycles.length > 0 ||
                        workspaceCycles.length > 0
                      }
                      className="w-full rounded border border-green-300 px-3 py-1 text-sm text-green-700 disabled:opacity-50"
                    >
                      Save rule
                    </button>

                    {rulePublishMessage && (
                      <p
                        className={`text-xs ${
                          rulePublishState === 'error'
                            ? 'text-red-600'
                            : rulePublishState === 'success'
                              ? 'text-green-600'
                              : 'text-gray-500'
                        }`}
                      >
                        {rulePublishMessage}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex justify-end pt-3">
                  <Link
                    href="/rulebook"
                    className="inline-flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    title="Open RuleBook"
                  >
                    <BookOpenIcon className="h-4 w-4" />
                    RuleBook
                  </Link>
                </div>
              </aside>
            )
          ) : null}
        </div>
        {(activeWorkspace ||
          workspaceMessage ||
          publishMessage ||
          rulePublishMessage ||
          buildAndSaveMessage) && (
          <div className="border-t border-gray-200 bg-white px-4 py-2 text-xs text-gray-600">
            <div className="flex flex-wrap items-center gap-3">
              {activeWorkspace && (
                <span>
                  Active workspace:{' '}
                  <span className="font-medium text-gray-800">{activeWorkspace.name}</span>
                </span>
              )}
              {workspaceMessage && (
                <span
                  className={
                    workspaceActionState === 'error'
                      ? 'text-red-600'
                      : workspaceActionState === 'success'
                        ? 'text-green-600'
                        : 'text-gray-500'
                  }
                >
                  {workspaceMessage}
                </span>
              )}
              {publishMessage && (
                <span
                  className={
                    publishState === 'error'
                      ? 'text-red-600'
                      : publishState === 'success'
                        ? 'text-green-600'
                        : 'text-gray-500'
                  }
                >
                  {publishMessage}
                </span>
              )}
              {rulePublishMessage && (
                <span
                  className={
                    rulePublishState === 'error'
                      ? 'text-red-600'
                      : rulePublishState === 'success'
                        ? 'text-green-600'
                        : 'text-gray-500'
                  }
                >
                  {rulePublishMessage}
                </span>
              )}
              {buildAndSaveMessage && (
                <span
                  className={
                    buildAndSaveState === 'error'
                      ? 'text-red-600'
                      : buildAndSaveState === 'success'
                        ? 'text-green-600'
                        : 'text-gray-500'
                  }
                >
                  {buildAndSaveMessage}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
      {showLoadDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Load workspace</h2>
                <p className="text-sm text-gray-500">Load a saved RuleBuilder workspace</p>
              </div>
              <button
                type="button"
                onClick={() => setShowLoadDialog(false)}
                className="rounded-md px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              >
                Close
              </button>
            </div>
            <div className="max-h-[28rem] overflow-y-auto px-5 py-4">
              {workspaceList.length === 0 ? (
                <p className="text-sm text-gray-500">No saved workspaces yet.</p>
              ) : (
                <div className="space-y-3">
                  {workspaceList.map((workspace: RuleBuilderWorkspaceSummary) => (
                    <button
                      key={workspace.id}
                      type="button"
                      onClick={() => {
                        void handleLoadWorkspace(workspace.id);
                      }}
                      className="flex w-full items-start justify-between rounded-lg border border-gray-200 px-4 py-3 text-left hover:border-orange-300 hover:bg-orange-50"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-gray-900">{workspace.name}</div>
                        <div className="mt-1 text-xs text-gray-500">
                          Entry: {workspace.entry_node_label || workspace.entry_node_id}
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          Updated: {formatWorkspaceTimestamp(workspace.updated_at)}
                        </div>
                      </div>
                      <div className="ml-4 shrink-0 text-xs text-gray-400">
                        {workspace.node_count} nodes / {workspace.edge_count} edges
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {showDeleteDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Delete workspaces</h2>
                <p className="text-sm text-gray-500">Delete previous saves</p>
              </div>
              <button
                type="button"
                onClick={() => setShowDeleteDialog(false)}
                className="rounded-md px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              >
                Close
              </button>
            </div>
            <div className="max-h-[28rem] overflow-y-auto px-5 py-4">
              {workspaceList.length === 0 ? (
                <p className="text-sm text-gray-500">No saved workspaces to delete.</p>
              ) : (
                <div className="space-y-3">
                  {workspaceList.map((workspace: RuleBuilderWorkspaceSummary) => (
                    <label
                      key={workspace.id}
                      className="flex items-start gap-3 rounded-lg border border-gray-200 px-4 py-3"
                    >
                      <input
                        type="checkbox"
                        checked={selectedWorkspaceIds.includes(workspace.id)}
                        onChange={() => toggleWorkspaceSelected(workspace.id)}
                        className="mt-1 h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                      />
                      <div className="min-w-0">
                        <div className="font-medium text-gray-900">{workspace.name}</div>
                        <div className="mt-1 text-xs text-gray-500">
                          Entry: {workspace.entry_node_label || workspace.entry_node_id}
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          Updated: {formatWorkspaceTimestamp(workspace.updated_at)}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-5 py-4">
              <button
                type="button"
                onClick={() => setShowDeleteDialog(false)}
                className="rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleDeleteSelectedWorkspaces();
                }}
                className="inline-flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
              >
                <TrashIcon className="h-4 w-4" />
                Delete selected
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

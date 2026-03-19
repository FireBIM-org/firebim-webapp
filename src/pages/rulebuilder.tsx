import { useCallback, useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import RuleLibraryPanel from '@/features/rulebuilder/components/RuleLibraryPanel';
import RuleCanvas from '@/features/rulebuilder/components/RuleCanvas';
import RuleInspectorPanel from '@/features/rulebuilder/components/RuleInspectorPanel';
import { RULE_LIBRARY } from '@/features/rulebuilder/library';
import {
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

export default function RuleBuilderPage() {
  const [libraryCollapsed, setLibraryCollapsed] = useState(false);
  const [apiStatus, setApiStatus] = useState<ApiStatus>('loading');
  const [storedElements, setStoredElements] = useState<RuleLibraryCategory['items']>([]);

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

  const loadStoredRuleElements = useCallback(async () => {
    const items = await listRuleElementsDetailed();

    const mapped = items.map((item) => {
      return {
        type: item.node_type,
        label: item.label,
        description: item.graph_uri || 'Stored rule element',
        source: 'api' as const,
        element_id: item.element_id,
        template: {
          node_type: item.node_type,
          label: item.label,
          graph_uri: item.graph_uri || null,
          config: {},
        },
      };
    });

    setStoredElements(mapped);
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

  const categories = useMemo<RuleLibraryCategory[]>(() => {
    return [
      ...RULE_LIBRARY,
      {
        id: 'stored-rule-elements',
        label: 'Stored rule elements',
        items: storedElements,
      },
    ];
  }, [storedElements]);

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
          label: selectedRule.label ? `${selectedRule.label} copy` : `${sourceId} copy`,
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

      const payload: RuleData = {
        ...selectedRule,
        label: selectedRule.label || selectedRule.id,
      };

      const result = await publishRuleElement(payload);

      setPublishState('success');
      setPublishMessage(`Published ${result.element_id || payload.id}`);

      await loadStoredRuleElements();

      setSelectedRule((current) =>
        current
          ? {
              ...current,
              graph_uri: result.graph_uri || current.graph_uri || null,
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
import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import RuleLibraryPanel from '@/features/rulebuilder/components/RuleLibraryPanel';
import RuleCanvas from '@/features/rulebuilder/components/RuleCanvas';
import { RULE_LIBRARY } from '@/features/rulebuilder/library';
import { getRulesHealth, listRuleElements } from '@/features/rulebuilder/api';
import { RuleLibraryCategory } from '@/features/rulebuilder/types';

type ApiStatus = 'loading' | 'online' | 'offline';

export default function RuleBuilderPage() {
  const [libraryCollapsed, setLibraryCollapsed] = useState(false);
  const [apiStatus, setApiStatus] = useState<ApiStatus>('loading');
  const [storedElements, setStoredElements] = useState<RuleLibraryCategory['items']>([]);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        await getRulesHealth();
        if (!active) return;
        setApiStatus('online');
      } catch {
        if (!active) return;
        setApiStatus('offline');
      }

      try {
        const items = await listRuleElements();
        if (!active) return;

        const mapped = items.map((item, index) => {
          const id = item.element_id || item.id || `rule-element-${index}`;
          const nodeType =
            item.node_type === 'start' || item.node_type === 'end' ? item.node_type : 'decision';

          return {
            type: nodeType,
            label: id,
            description: item.graph_uri || 'Stored rule element',
            source: 'api' as const,
            template: {
              node_type: nodeType,
              label: id,
              graph_uri: item.graph_uri || null,
              config: {},
            },
          };
        });

        setStoredElements(mapped);
      } catch {
        if (!active) return;
        setStoredElements([]);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, []);

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
            <RuleCanvas />
          </div>
        </div>
      </div>
    </Layout>
  );
}
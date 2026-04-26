import {
  Bars3Icon,
  BeakerIcon,
  BookOpenIcon,
  ChevronDoubleDownIcon,
  ChevronDoubleUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleStackIcon,
  DocumentMagnifyingGlassIcon,
  FunnelIcon,
  LinkIcon,
  MagnifyingGlassIcon,
  PlayIcon,
  RectangleGroupIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { useMemo, useState } from 'react';

import Layout from '@/components/Layout';
import LoadingSpinner from '@/components/LoadingSpinner';
import { useRequireAuth } from '@/hooks/useRequireAuth';

type CoverageState = 'covered' | 'partial' | 'missing' | 'suggested';
type InspectorTab = 'coverage' | 'suggestions' | 'readiness';
type DrawerState = 'closed' | 'half' | 'full';

type RequirementNode = {
  id: string;
  label: string;
  kind: 'rule' | 'class' | 'property' | 'relation';
  ontology: 'Rule' | 'IFC' | 'FBO' | 'RIR';
  status: CoverageState;
  description: string;
  evidence: string[];
  suggestions: string[];
  children?: RequirementNode[];
};

type ProfileSummary = {
  id: string;
  name: string;
  mode: string;
  rules: number;
  graph: string;
  readiness: CoverageState;
};

const profiles: ProfileSummary[] = [
  {
    id: 'fire-doors',
    name: 'Fire Door Readiness',
    mode: 'IFC + FBO',
    rules: 4,
    graph: 'Campus A BIM graph',
    readiness: 'partial',
  },
  {
    id: 'escape-routes',
    name: 'Escape Route Controls',
    mode: 'FBO',
    rules: 6,
    graph: 'No BIM graph selected',
    readiness: 'missing',
  },
  {
    id: 'room-usage',
    name: 'Room Usage Baseline',
    mode: 'IFC + RIR',
    rules: 3,
    graph: 'Hospital wing BIM graph',
    readiness: 'covered',
  },
];

const requirementTree: RequirementNode[] = [
  {
    id: 'rule-fire-door',
    label: 'Fire door requirement set',
    kind: 'rule',
    ontology: 'Rule',
    status: 'partial',
    description: 'Machine-readable rules for fire-rated doors and their required definitions.',
    evidence: ['4 published rules', 'Derived from RuleBuilder workspace'],
    suggestions: [
      'Check which rules this profile can support',
      'Save as a new profile after accepting choices',
    ],
    children: [
      {
        id: 'class-ifc-door',
        label: 'IfcDoor',
        kind: 'class',
        ontology: 'IFC',
        status: 'covered',
        description: 'Door definition used as the main BIM object target.',
        evidence: ['142 BIM objects', 'IfcDoor found in selected BIM graph'],
        suggestions: ['Keep as IFC class target'],
        children: [
          {
            id: 'prop-fire-rating',
            label: 'FireRating',
            kind: 'property',
            ontology: 'FBO',
            status: 'missing',
            description: 'Required fire resistance rating definition for fire door checks.',
            evidence: ['No direct BIM graph value found'],
            suggestions: ['Use Pset_DoorCommon.FireRating for this definition'],
          },
          {
            id: 'prop-operation-type',
            label: 'OperationType',
            kind: 'property',
            ontology: 'IFC',
            status: 'suggested',
            description: 'Door operation type may help confirm special door behavior.',
            evidence: ['39 possible BIM graph values', 'Suggested match score 0.82'],
            suggestions: ['Use IfcDoor.OperationType as supporting information'],
          },
        ],
      },
      {
        id: 'class-fire-compartment',
        label: 'FBO Fire Compartment',
        kind: 'class',
        ontology: 'FBO',
        status: 'missing',
        description: 'FBO fire compartment definition needed by downstream rules.',
        evidence: ['No matching definition found in BIM graph'],
        suggestions: [
          'Use IfcZone when it has compartment classification',
          'Compare with RIR definitions',
        ],
      },
    ],
  },
  {
    id: 'rule-egress',
    label: 'Escape access context',
    kind: 'rule',
    ontology: 'Rule',
    status: 'suggested',
    description: 'Optional context that can make the profile easier to use before checks.',
    evidence: ['2 related rules are partially supported'],
    suggestions: ['Add IfcSpace adjacency information', 'Compare with RIR room usage definitions'],
    children: [
      {
        id: 'relation-door-space',
        label: 'Door connects to protected space',
        kind: 'relation',
        ontology: 'FBO',
        status: 'partial',
        description: 'Information about how door objects and spaces are connected.',
        evidence: ['18 connections found', '23 possible connections need review'],
        suggestions: ['Use this only when the door and space connection is on the same object'],
      },
    ],
  },
];

const statusStyles: Record<CoverageState, string> = {
  covered: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  partial: 'border-amber-200 bg-amber-50 text-amber-800',
  missing: 'border-rose-200 bg-rose-50 text-rose-800',
  suggested: 'border-sky-200 bg-sky-50 text-sky-800',
};

const statusLabels: Record<CoverageState, string> = {
  covered: 'Ready',
  partial: 'Needs review',
  missing: 'Missing',
  suggested: 'Suggested',
};

const tabLabels: Record<InspectorTab, string> = {
  coverage: 'Found',
  suggestions: 'Choices',
  readiness: 'Ready',
};

function flattenNodes(nodes: RequirementNode[]): RequirementNode[] {
  return nodes.flatMap((node) => [node, ...flattenNodes(node.children || [])]);
}

function StatusBadge({ status }: { status: CoverageState }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${statusStyles[status]}`}
    >
      {statusLabels[status]}
    </span>
  );
}

function OntologyBadge({ value }: { value: RequirementNode['ontology'] }) {
  const color =
    value === 'IFC'
      ? 'border-blue-200 bg-blue-50 text-blue-700'
      : value === 'FBO'
        ? 'border-orange-200 bg-orange-50 text-orange-700'
        : value === 'RIR'
          ? 'border-violet-200 bg-violet-50 text-violet-700'
          : 'border-gray-200 bg-gray-50 text-gray-700';

  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold ${color}`}
    >
      {value}
    </span>
  );
}

function RequirementCard({
  node,
  depth,
  selectedNodeId,
  onSelect,
}: {
  node: RequirementNode;
  depth: number;
  selectedNodeId: string;
  onSelect: (node: RequirementNode) => void;
}) {
  const isSelected = selectedNodeId === node.id;

  return (
    <div className={depth > 0 ? 'ml-8 border-l border-dashed border-gray-300 pl-5' : ''}>
      <button
        type="button"
        onClick={() => onSelect(node)}
        className={`group mb-3 w-full rounded-lg border bg-white p-3 text-left shadow-sm transition hover:border-gray-300 hover:shadow ${
          isSelected ? 'border-orange-400 ring-2 ring-orange-100' : 'border-gray-200'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-semibold text-gray-950">{node.label}</span>
              <OntologyBadge value={node.ontology} />
            </div>
            <p className="mt-1 line-clamp-2 text-xs text-gray-500">{node.description}</p>
          </div>
          <StatusBadge status={node.status} />
        </div>
      </button>

      {node.children?.map((child) => (
        <RequirementCard
          key={child.id}
          node={child}
          depth={depth + 1}
          selectedNodeId={selectedNodeId}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

export default function LexiconPage() {
  const { user, isLoading: authLoading } = useRequireAuth();
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [drawerState, setDrawerState] = useState<DrawerState>('half');
  const [activeProfileId, setActiveProfileId] = useState(profiles[0].id);
  const [activeTab, setActiveTab] = useState<InspectorTab>('coverage');
  const allNodes = useMemo(() => flattenNodes(requirementTree), []);
  const [selectedNodeId, setSelectedNodeId] = useState(allNodes[2].id);
  const selectedNode = allNodes.find((node) => node.id === selectedNodeId) || allNodes[0];
  const activeProfile = profiles.find((profile) => profile.id === activeProfileId) || profiles[0];

  const coverageCounts = useMemo(
    () =>
      allNodes.reduce(
        (acc, node) => {
          acc[node.status] += 1;
          return acc;
        },
        { covered: 0, partial: 0, missing: 0, suggested: 0 } satisfies Record<
          CoverageState,
          number
        >,
      ),
    [allNodes],
  );

  if (authLoading || !user) {
    return (
      <Layout title="Loading... | FireBIM">
        <LoadingSpinner />
      </Layout>
    );
  }

  const drawerHeight = drawerState === 'closed' ? 'h-10' : drawerState === 'half' ? 'h-56' : 'h-96';

  return (
    <Layout title="Lexicon | FireBIM">
      <div className="rule-workspace-frame">
        <div className="rule-workspace-frame-header">
          <div className="rule-workspace-frame-header-row">
            <div className="min-w-0">
              <div className="rule-workspace-header">Lexicon</div>
              <div className="text-xs text-gray-500">
                Save and reuse definition choices across standards, rules, and BIM graphs
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
              <div className="rounded-md border border-gray-200 bg-white px-3 py-2">
                <span className="text-gray-500">Setup</span>
                <span className="ml-2 font-semibold text-gray-900">{activeProfile.mode}</span>
              </div>
              <div className="rounded-md border border-gray-200 bg-white px-3 py-2">
                <span className="text-gray-500">BIM graph</span>
                <span className="ml-2 font-semibold text-gray-900">{activeProfile.graph}</span>
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-md bg-orange-600 px-3 py-2 font-semibold text-white hover:bg-orange-700"
              >
                <PlayIcon className="h-4 w-4" />
                Run checks
              </button>
            </div>
          </div>
        </div>

        <div className="flex h-[78vh] min-h-[680px] overflow-hidden bg-gray-100">
          <aside
            className={`flex shrink-0 flex-col border-r border-gray-200 bg-white transition-all ${
              leftCollapsed ? 'w-16' : 'w-80'
            }`}
          >
            <div className="flex items-center justify-between border-b border-gray-200 p-3">
              {!leftCollapsed && (
                <div>
                  <div className="rule-workspace-header">Profiles</div>
                  <p className="text-xs text-gray-500">Saved definition choices</p>
                </div>
              )}
              <button
                type="button"
                onClick={() => setLeftCollapsed((value) => !value)}
                className="rounded-md border border-gray-200 p-2 text-gray-600 hover:bg-gray-50"
                title={leftCollapsed ? 'Expand profiles' : 'Collapse profiles'}
                aria-label={leftCollapsed ? 'Expand profiles' : 'Collapse profiles'}
              >
                {leftCollapsed ? (
                  <ChevronRightIcon className="h-4 w-4" />
                ) : (
                  <ChevronLeftIcon className="h-4 w-4" />
                )}
              </button>
            </div>

            {leftCollapsed ? (
              <div className="flex flex-1 flex-col items-center gap-3 py-4">
                <RectangleGroupIcon className="h-5 w-5 text-gray-500" />
                <BookOpenIcon className="h-5 w-5 text-gray-500" />
                <CircleStackIcon className="h-5 w-5 text-gray-500" />
                <FunnelIcon className="h-5 w-5 text-gray-500" />
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                <div className="mb-3 flex items-center gap-2 rounded-md border border-gray-200 px-2 py-2">
                  <MagnifyingGlassIcon className="h-4 w-4 text-gray-400" />
                  <span className="text-xs text-gray-500">Search profiles, rules, BIM graphs</span>
                </div>

                <div className="space-y-2">
                  {profiles.map((profile) => (
                    <button
                      key={profile.id}
                      type="button"
                      onClick={() => setActiveProfileId(profile.id)}
                      className={`w-full rounded-lg border p-3 text-left ${
                        activeProfileId === profile.id
                          ? 'border-orange-300 bg-orange-50'
                          : 'border-gray-200 bg-white hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-gray-950">
                            {profile.name}
                          </div>
                          <div className="mt-1 text-xs text-gray-500">
                            {profile.rules} rules · {profile.mode} standards
                          </div>
                        </div>
                        <StatusBadge status={profile.readiness} />
                      </div>
                    </button>
                  ))}
                </div>

                <div className="mt-4 border-t border-gray-200 pt-4">
                  <div className="rule-workspace-header mb-2">Browse</div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {['Rules', 'BIM graphs', 'Standards', 'Definitions'].map((item) => (
                      <button
                        key={item}
                        type="button"
                        className="rounded-md border border-gray-200 px-3 py-2 text-gray-700 hover:bg-gray-50"
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </aside>

          <section className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-base font-semibold text-gray-950">
                    {activeProfile.name}
                  </h1>
                  <StatusBadge status={activeProfile.readiness} />
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  A profile records how definitions should carry across standards and BIM graphs
                </p>
              </div>

              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                {Object.entries(coverageCounts).map(([status, count]) => (
                  <div
                    key={status}
                    className="rounded-md border border-gray-200 bg-white px-3 py-2"
                  >
                    <div className="font-semibold text-gray-950">{count}</div>
                    <div className="text-gray-500">{statusLabels[status as CoverageState]}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto bg-slate-100 p-6">
              <div className="mx-auto min-h-full w-full max-w-5xl rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-4">
                  <div>
                    <div className="rule-workspace-header">Profile Builder</div>
                    <p className="mt-1 text-xs text-gray-500">
                      Review what the profile needs, what was found, and what needs a decision
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {['IFC', 'FBO', 'RIR'].map((ontology) => (
                      <span
                        key={ontology}
                        className="rounded border border-gray-200 px-2 py-1 text-xs font-semibold text-gray-700"
                      >
                        {ontology}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  {requirementTree.map((node) => (
                    <RequirementCard
                      key={node.id}
                      node={node}
                      depth={0}
                      selectedNodeId={selectedNode.id}
                      onSelect={(nextNode) => {
                        setSelectedNodeId(nextNode.id);
                        setRightCollapsed(false);
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div
              className={`shrink-0 border-t border-gray-200 bg-white transition-all ${drawerHeight}`}
            >
              <div className="flex h-10 items-center justify-between px-4">
                <div className="flex items-center gap-2">
                  <DocumentMagnifyingGlassIcon className="h-4 w-4 text-gray-500" />
                  <span className="text-xs font-semibold tracking-wide text-gray-700 uppercase">
                    Details
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setDrawerState('closed')}
                    className="rounded p-1 text-gray-500 hover:bg-gray-100"
                    title="Close details"
                    aria-label="Close details"
                  >
                    <ChevronDoubleDownIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDrawerState(drawerState === 'full' ? 'half' : 'full')}
                    className="rounded p-1 text-gray-500 hover:bg-gray-100"
                    title="Resize details"
                    aria-label="Resize details"
                  >
                    <ChevronDoubleUpIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {drawerState !== 'closed' && (
                <div className="grid h-[calc(100%-2.5rem)] grid-cols-3 gap-4 overflow-y-auto px-4 pb-4 text-sm">
                  <div>
                    <div className="mb-2 font-semibold text-gray-900">BIM graph details</div>
                    <div className="space-y-2">
                      {selectedNode.evidence.map((item) => (
                        <div key={item} className="rounded-md bg-gray-50 p-2 text-xs text-gray-600">
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="mb-2 font-semibold text-gray-900">Ready signals</div>
                    <div className="space-y-2 text-xs text-gray-600">
                      <div className="rounded-md bg-emerald-50 p-2 text-emerald-800">
                        Basic structure looks ready for the selected BIM graph.
                      </div>
                      <div className="rounded-md bg-amber-50 p-2 text-amber-800">
                        This profile needs 2 definition choices before it is fully ready.
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="mb-2 font-semibold text-gray-900">Backend calls</div>
                    <div className="space-y-2 font-mono text-[11px] text-gray-600">
                      <div className="rounded-md bg-gray-50 p-2">profile.compareWithGraph()</div>
                      <div className="rounded-md bg-gray-50 p-2">profile.recommendedChoices()</div>
                      <div className="rounded-md bg-gray-50 p-2">profile.readyCheck()</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          <aside
            className={`flex shrink-0 flex-col border-l border-gray-200 bg-white transition-all ${
              rightCollapsed ? 'w-14' : 'w-96'
            }`}
          >
            <div className="flex items-center justify-between border-b border-gray-200 p-3">
              {!rightCollapsed && (
                <div>
                  <div className="rule-workspace-header">Assistant</div>
                  <p className="text-xs text-gray-500">Recommended next steps</p>
                </div>
              )}
              <button
                type="button"
                onClick={() => setRightCollapsed((value) => !value)}
                className="rounded-md border border-gray-200 p-2 text-gray-600 hover:bg-gray-50"
                title={rightCollapsed ? 'Expand assistant' : 'Collapse assistant'}
                aria-label={rightCollapsed ? 'Expand assistant' : 'Collapse assistant'}
              >
                {rightCollapsed ? (
                  <ChevronLeftIcon className="h-4 w-4" />
                ) : (
                  <ChevronRightIcon className="h-4 w-4" />
                )}
              </button>
            </div>

            {rightCollapsed ? (
              <div className="flex flex-1 flex-col items-center gap-3 py-4">
                <SparklesIcon className="h-5 w-5 text-gray-500" />
                <LinkIcon className="h-5 w-5 text-gray-500" />
                <BeakerIcon className="h-5 w-5 text-gray-500" />
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-gray-950">
                        {selectedNode.label}
                      </div>
                      <div className="mt-1 flex gap-2">
                        <OntologyBadge value={selectedNode.ontology} />
                        <StatusBadge status={selectedNode.status} />
                      </div>
                    </div>
                    <Bars3Icon className="h-5 w-5 text-gray-400" />
                  </div>
                  <p className="text-xs text-gray-600">{selectedNode.description}</p>
                </div>

                <div className="mb-4 grid grid-cols-3 rounded-md border border-gray-200 p-1 text-xs">
                  {(['coverage', 'suggestions', 'readiness'] as InspectorTab[]).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActiveTab(tab)}
                      className={`rounded px-2 py-1.5 font-semibold capitalize ${
                        activeTab === tab
                          ? 'bg-gray-900 text-white'
                          : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {tabLabels[tab]}
                    </button>
                  ))}
                </div>

                {activeTab === 'coverage' && (
                  <div className="space-y-3">
                    <div className="rule-workspace-header">Found in BIM Graph</div>
                    {selectedNode.evidence.map((item) => (
                      <div key={item} className="rounded-md border border-gray-200 p-3 text-sm">
                        <div className="font-medium text-gray-900">{item}</div>
                        <div className="mt-1 text-xs text-gray-500">
                          Found while comparing this profile with the selected BIM graph.
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {activeTab === 'suggestions' && (
                  <div className="space-y-3">
                    <div className="rule-workspace-header">Recommended Choices</div>
                    {selectedNode.suggestions.map((item) => (
                      <div key={item} className="rounded-md border border-gray-200 p-3">
                        <div className="flex items-start gap-2">
                          <SparklesIcon className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" />
                          <div className="text-sm text-gray-800">{item}</div>
                        </div>
                        <button
                          type="button"
                          className="mt-3 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                        >
                          Use this choice
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {activeTab === 'readiness' && (
                  <div className="space-y-3">
                    <div className="rule-workspace-header">Ready Check</div>
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                      This profile can run partial checks, but missing targets should be resolved
                      before publishing the final profile variant.
                    </div>
                    <button
                      type="button"
                      className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50"
                    >
                      <BeakerIcon className="h-4 w-4" />
                      Check if ready
                    </button>
                  </div>
                )}
              </div>
            )}
          </aside>
        </div>
      </div>
    </Layout>
  );
}

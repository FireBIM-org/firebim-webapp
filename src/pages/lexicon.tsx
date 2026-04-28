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
import { useEffect, useMemo, useState } from 'react';

import type { RuleListItem, RuleRunnerItem } from '@/features/rulebook/types';

import Layout from '@/components/Layout';
import LoadingSpinner from '@/components/LoadingSpinner';
import { env } from '@/config/env';
import RuleBookLibraryPanel from '@/features/rulebook/components/RuleBookLibraryPanel';
import { useRuleBookStore, type RuleBookStore } from '@/features/rulebook/store';
import { useRequireAuth } from '@/hooks/useRequireAuth';

type CoverageState = 'covered' | 'partial' | 'missing' | 'suggested';
type InspectorTab = 'coverage' | 'suggestions' | 'readiness';
type DrawerState = 'closed' | 'half' | 'full';
type LexiconMode =
  | 'start'
  | 'rules'
  | 'graph'
  | 'profiles'
  | 'standards'
  | 'recommended'
  | 'workspace'
  | 'inspect';
type InspectView =
  | 'summary'
  | 'coverage'
  | 'choices'
  | 'readiness'
  | 'conformity'
  | 'evidence'
  | 'reconstruction';

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

type StartOption = {
  id: LexiconMode;
  title: string;
  description: string;
  helper: string;
  icon: typeof BookOpenIcon;
  available: boolean;
};

type StandardSummary = {
  id: string;
  ontology_family: string;
  country: string;
  version: string;
  title: string;
  description: string;
  status: string;
  class_count: number;
  property_count: number;
  property_set_count: number;
};

type StandardDragPayload = {
  kind: 'lexicon-standard';
  standard_id: string;
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

const startOptions: StartOption[] = [
  {
    id: 'rules',
    title: 'Create from rules',
    description: 'Build a profile from one or more machine-readable rules.',
    helper:
      'Choose rules first. Lexicon can recommend standards and definition choices after that.',
    icon: BookOpenIcon,
    available: true,
  },
  {
    id: 'graph',
    title: 'Create from a BIM graph',
    description: 'Let Lexicon find definitions in a BIM representation.',
    helper: 'Useful when you want to learn what your BIM data can support before choosing rules.',
    icon: CircleStackIcon,
    available: false,
  },
  {
    id: 'profiles',
    title: 'Use an existing profile',
    description: 'Open, copy, combine, or continue saved definition choices.',
    helper:
      'Profiles save decisions so they can be reused across rules, standards, and BIM graphs.',
    icon: RectangleGroupIcon,
    available: false,
  },
  {
    id: 'standards',
    title: 'Start with standards',
    description: 'Browse FBO, IFC, or RIR versions and build from selected definitions.',
    helper: 'Use this when you already know which standard or version matters.',
    icon: FunnelIcon,
    available: false,
  },
  {
    id: 'recommended',
    title: 'Recommend setup',
    description: 'Answer a few questions and let Lexicon suggest the starting point.',
    helper:
      'The fastest path if you want control but do not want to configure everything manually.',
    icon: SparklesIcon,
    available: false,
  },
];

const standardSources = [
  { ontology_family: 'fbo', country: 'dk', fallback_version: 'latest' },
  { ontology_family: 'ifc', country: 'global', fallback_version: 'latest' },
  { ontology_family: 'rir', country: 'global', fallback_version: 'latest' },
];

const fallbackStandards: StandardSummary[] = [
  {
    id: 'fbo/dk/latest',
    ontology_family: 'fbo',
    country: 'dk',
    version: 'latest',
    title: 'FBO DK',
    description: 'FBO standard for Danish fire-domain definitions.',
    status: 'available',
    class_count: 0,
    property_count: 0,
    property_set_count: 0,
  },
  {
    id: 'ifc/global/latest',
    ontology_family: 'ifc',
    country: 'global',
    version: 'latest',
    title: 'IFC',
    description: 'IFC standard for BIM object classes and property sets.',
    status: 'available',
    class_count: 0,
    property_count: 0,
    property_set_count: 0,
  },
  {
    id: 'rir/global/latest',
    ontology_family: 'rir',
    country: 'global',
    version: 'latest',
    title: 'RIR',
    description: 'Regulatory Information Requirements reference standard.',
    status: 'available',
    class_count: 0,
    property_count: 0,
    property_set_count: 0,
  },
];

const modeLabels: Record<LexiconMode, string> = {
  start: 'Start',
  rules: 'Rules',
  graph: 'BIM graphs',
  profiles: 'Profiles',
  standards: 'Standards',
  recommended: 'Recommended setup',
  workspace: 'Profile',
  inspect: 'Inspect profile',
};

const inspectActions: Array<{
  id: InspectView;
  label: string;
  description: string;
  endpoint: string;
}> = [
  {
    id: 'summary',
    label: 'Profile summary',
    description: 'Show the rules, standards, target classes, and properties in this profile.',
    endpoint: 'POST /lexicon/profiles/summary',
  },
  {
    id: 'coverage',
    label: 'Rule coverage',
    description: 'Check which rule requirements are represented by the profile.',
    endpoint: 'GET /lexicon/profiles/{profile_id}/rules/coverage',
  },
  {
    id: 'choices',
    label: 'Recommended choices',
    description: 'Find candidate definition choices the user can accept or reject.',
    endpoint: 'GET /lexicon/profiles/{profile_id}/mappings/candidates',
  },
  {
    id: 'readiness',
    label: 'Readiness',
    description: 'Estimate whether the profile is ready to save, share, or use for checks.',
    endpoint: 'POST /lexicon/profiles/summary',
  },
  {
    id: 'conformity',
    label: 'Conformity',
    description: 'Run semantic and structural validity checks for the current profile.',
    endpoint: 'POST /lexicon/conformity/check',
  },
  {
    id: 'evidence',
    label: 'Graph evidence',
    description: 'Prepare the view that later compares this profile with a BIM graph.',
    endpoint: 'POST /lexicon/graphs/evidence-summary',
  },
  {
    id: 'reconstruction',
    label: 'Reconstruction',
    description: 'Preview how the selected standards can support a canonical graph.',
    endpoint: 'POST /lexicon/reconstruction',
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

type RuleDragPayload = {
  kind: 'rulebook-rule' | 'rulebook-runner-item';
  rule_id?: string;
  runner_item_id?: string;
  from_index?: number;
};

function parseRuleDragPayload(event: React.DragEvent): RuleDragPayload | null {
  const value =
    event.dataTransfer.getData('application/firebim-rulebook-runner-item') ||
    event.dataTransfer.getData('application/firebim-rulebook-rule');

  if (!value) return null;

  try {
    return JSON.parse(value) as RuleDragPayload;
  } catch {
    return null;
  }
}

function parseStandardDragPayload(event: React.DragEvent): StandardDragPayload | null {
  const value = event.dataTransfer.getData('application/firebim-lexicon-standard');

  if (!value) return null;

  try {
    return JSON.parse(value) as StandardDragPayload;
  } catch {
    return null;
  }
}

function standardLabel(standard: StandardSummary) {
  const family = standard.ontology_family.toUpperCase();
  const country =
    standard.country === 'global' ? 'Global' : standard.country.toLocaleUpperCase('en-US');

  return `${family} ${country}`;
}

function normalizeStandardSummary(input: unknown, fallback: (typeof standardSources)[number]) {
  const raw = (input ?? {}) as Record<string, unknown>;
  const ontology_family = String(raw.ontology_family ?? fallback.ontology_family);
  const country = String(raw.country ?? fallback.country);
  const version = String(raw.version ?? raw.default_version ?? fallback.fallback_version);

  return {
    id: `${ontology_family}/${country}/${version}`,
    ontology_family,
    country,
    version,
    title: String(raw.title ?? `${ontology_family.toUpperCase()} ${country}`),
    description: String(raw.description ?? 'Standard available from the ontologies API.'),
    status: String(raw.status ?? 'available'),
    class_count: typeof raw.class_count === 'number' ? raw.class_count : 0,
    property_count: typeof raw.property_count === 'number' ? raw.property_count : 0,
    property_set_count: typeof raw.property_set_count === 'number' ? raw.property_set_count : 0,
  } satisfies StandardSummary;
}

async function listOntologyStandards(): Promise<StandardSummary[]> {
  const results: StandardSummary[] = [];

  for (const source of standardSources) {
    const overviewResponse = await fetch(
      `${env.apiBaseUrl}/ontologies/${source.ontology_family}/${source.country}`,
    );

    if (!overviewResponse.ok) {
      throw new Error(`Could not load ${source.ontology_family}/${source.country}`);
    }

    const overview = (await overviewResponse.json()) as Record<string, unknown>;
    const version = String(overview.default_version ?? overview.latest_version ?? 'latest');
    const summaryResponse = await fetch(
      `${env.apiBaseUrl}/ontologies/${source.ontology_family}/${source.country}/versions/${version}/summary`,
    );

    if (!summaryResponse.ok) {
      results.push(normalizeStandardSummary({ ...overview, version }, source));
      continue;
    }

    results.push(normalizeStandardSummary(await summaryResponse.json(), source));
  }

  return results;
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

function LexiconRuleStack({
  items,
  onRemove,
  onMove,
}: {
  items: RuleRunnerItem[];
  onRemove: (runner_item_id: string) => void;
  onMove: (from_index: number, to_index: number) => void;
}) {
  const handleDragStart = (
    event: React.DragEvent<HTMLDivElement>,
    item: RuleRunnerItem,
    index: number,
  ) => {
    event.dataTransfer.setData(
      'application/firebim-rulebook-runner-item',
      JSON.stringify({
        kind: 'rulebook-runner-item',
        runner_item_id: item.runner_item_id,
        rule_id: item.rule_id,
        from_index: index,
      }),
    );
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleDropOnItem = (event: React.DragEvent<HTMLDivElement>, toIndex: number) => {
    event.preventDefault();
    const payload = parseRuleDragPayload(event);

    if (payload?.kind !== 'rulebook-runner-item' || typeof payload.from_index !== 'number') {
      return;
    }

    event.stopPropagation();
    onMove(payload.from_index, toIndex);
  };

  if (items.length === 0) {
    return (
      <div className="flex min-h-72 items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white/70 px-6 text-center">
        <div>
          <div className="text-sm font-semibold text-gray-700">Drop rules here</div>
          <p className="mt-2 max-w-sm text-sm text-gray-500">
            Open the Rule Library, drag one or more rules into this side, and Lexicon will start a
            profile draft from them.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div
          key={item.runner_item_id}
          draggable
          onDragStart={(event) => handleDragStart(event, item, index)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => handleDropOnItem(event, index)}
          className="group rounded-xl border border-sky-200 bg-white p-3 shadow-sm transition hover:border-sky-300 hover:shadow-md"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] font-semibold tracking-wide text-sky-700 uppercase">
                Rule {index + 1}
              </div>
              <div className="mt-1 truncate text-sm font-semibold text-gray-950">{item.label}</div>
              <div className="mt-1 text-xs text-gray-500">
                This rule will contribute definitions to the profile draft.
              </div>
            </div>

            <button
              type="button"
              onClick={() => onRemove(item.runner_item_id)}
              className="rounded-md border border-gray-200 px-2 py-1 text-xs font-semibold text-gray-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
            >
              Remove
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function StandardLibraryPanel({
  collapsed,
  standards,
  loading,
  error,
  onToggleCollapsed,
}: {
  collapsed: boolean;
  standards: StandardSummary[];
  loading: boolean;
  error: string | null;
  onToggleCollapsed: () => void;
}) {
  const handleDragStart = (event: React.DragEvent<HTMLDivElement>, standard: StandardSummary) => {
    event.dataTransfer.setData(
      'application/firebim-lexicon-standard',
      JSON.stringify({
        kind: 'lexicon-standard',
        standard_id: standard.id,
      }),
    );
    event.dataTransfer.effectAllowed = 'move';
  };

  if (collapsed) {
    return (
      <aside className="flex w-14 shrink-0 flex-col items-center border-l border-gray-200 bg-white py-2">
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          title="Open Standard Library"
          aria-label="Open Standard Library"
        >
          <FunnelIcon className="h-5 w-5" />
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex w-96 shrink-0 flex-col border-l border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="rule-workspace-header">Standard Library</div>
            <p className="mt-1 text-xs text-gray-500">
              Ontologies from the backend, presented as standards for profile work.
            </p>
          </div>
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            title="Collapse Standard Library"
            aria-label="Collapse Standard Library"
          >
            <ChevronRightIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mb-4 rounded-lg border border-orange-200 bg-orange-50 p-3 text-xs text-orange-900">
          Drag one or more standards into the right side of the canvas. Lexicon uses them to keep
          definitions consistent across rules, profiles, and BIM graphs.
        </div>

        {loading && <div className="text-sm text-gray-500">Loading standards...</div>}
        {error && (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            {error}
          </div>
        )}

        <div className="space-y-3">
          {standards.map((standard) => (
            <div
              key={standard.id}
              draggable
              onDragStart={(event) => handleDragStart(event, standard)}
              className="cursor-move rounded-xl border border-gray-200 bg-white p-3 shadow-sm transition hover:border-orange-300 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold tracking-wide text-orange-700 uppercase">
                    {standard.ontology_family}/{standard.country}
                  </div>
                  <div className="mt-1 truncate text-sm font-semibold text-gray-950">
                    {standard.title || standardLabel(standard)}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-gray-500">{standard.description}</p>
                </div>
                <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-semibold text-gray-500 uppercase">
                  {standard.status}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px] text-gray-600">
                <div className="rounded-md bg-gray-50 px-2 py-1">
                  <div className="font-semibold text-gray-900">{standard.class_count}</div>
                  <div>Classes</div>
                </div>
                <div className="rounded-md bg-gray-50 px-2 py-1">
                  <div className="font-semibold text-gray-900">{standard.property_count}</div>
                  <div>Props</div>
                </div>
                <div className="rounded-md bg-gray-50 px-2 py-1">
                  <div className="font-semibold text-gray-900">{standard.property_set_count}</div>
                  <div>Sets</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

function LexiconStandardStack({
  standards,
  onRemove,
}: {
  standards: StandardSummary[];
  onRemove: (standard_id: string) => void;
}) {
  if (standards.length === 0) {
    return (
      <div className="flex min-h-72 items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white/70 px-6 text-center">
        <div>
          <div className="text-sm font-semibold text-gray-700">Drop standards here</div>
          <p className="mt-2 max-w-sm text-sm text-gray-500">
            Choose the standards Lexicon should use to interpret classes, properties, and
            definitions consistently.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {standards.map((standard, index) => (
        <div
          key={standard.id}
          className="rounded-xl border border-orange-200 bg-white p-3 shadow-sm"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] font-semibold tracking-wide text-orange-700 uppercase">
                Standard {index + 1}
              </div>
              <div className="mt-1 truncate text-sm font-semibold text-gray-950">
                {standard.title || standardLabel(standard)}
              </div>
              <div className="mt-1 text-xs text-gray-500">
                Version {standard.version} - {standardLabel(standard)}
              </div>
            </div>

            <button
              type="button"
              onClick={() => onRemove(standard.id)}
              className="rounded-md border border-gray-200 px-2 py-1 text-xs font-semibold text-gray-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
            >
              Remove
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function StepPill({
  label,
  active,
  done,
  onClick,
}: {
  label: string;
  active?: boolean;
  done?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      title={onClick ? 'Go back. Current changes are not saved yet.' : undefined}
      className={[
        'rounded-md border px-3 py-2 text-xs font-semibold transition',
        done
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
          : active
            ? 'border-gray-200 bg-white text-gray-900'
            : 'border-gray-200 bg-gray-50 text-gray-500',
        onClick ? 'cursor-pointer' : 'cursor-default',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

function InspectResponsePanel({
  view,
  ruleCount,
  standards,
}: {
  view: InspectView;
  ruleCount: number;
  standards: StandardSummary[];
}) {
  const activeAction = inspectActions.find((action) => action.id === view) || inspectActions[0];

  if (view === 'summary') {
    return (
      <div className="space-y-5">
        <div>
          <div className="rule-workspace-header">Profile summary</div>
          <p className="mt-2 text-sm text-gray-600">
            This profile draft combines {ruleCount} rules with {standards.length} standards. The
            backend summary should become the primary source for target classes, properties, and
            unresolved choices.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {[
            ['Rules', ruleCount],
            ['Standards', standards.length],
            ['Definitions', ruleCount * Math.max(standards.length, 1) * 3],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="text-xs font-semibold text-gray-500 uppercase">{label}</div>
              <div className="mt-2 text-2xl font-semibold text-gray-950">{value}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (view === 'coverage') {
    return (
      <div>
        <div className="rule-workspace-header">Rule coverage</div>
        <div className="mt-4 space-y-3">
          {[
            ['Target classes', 'Ready', 'Rules have at least one standard to resolve classes.'],
            ['Required properties', 'Needs review', 'Some properties may need a user choice.'],
            ['Decision paths', 'Ready', 'Rule order can be inspected before saving.'],
          ].map(([label, status, text]) => (
            <div key={label} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="font-semibold text-gray-950">{label}</div>
                <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-semibold text-gray-600 uppercase">
                  {status}
                </span>
              </div>
              <p className="mt-2 text-sm text-gray-600">{text}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (view === 'choices') {
    return (
      <div>
        <div className="rule-workspace-header">Recommended choices</div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {standards.map((standard) => (
            <div key={standard.id} className="rounded-lg border border-orange-200 bg-white p-4">
              <div className="text-sm font-semibold text-gray-950">
                Use {standardLabel(standard)} for definitions
              </div>
              <p className="mt-2 text-sm text-gray-600">
                Candidate choices can be explained with similarity scores and relation evidence.
              </p>
              <button
                type="button"
                className="mt-3 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                Review choice
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (view === 'readiness' || view === 'conformity') {
    return (
      <div>
        <div className="rule-workspace-header">
          {view === 'readiness' ? 'Readiness' : 'Conformity'}
        </div>
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
          The draft has the minimum structure for this prototype: rules and standards are both
          present.
        </div>
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
          Next backend wiring should distinguish readiness from actual conformity checks.
        </div>
      </div>
    );
  }

  if (view === 'evidence') {
    return (
      <div>
        <div className="rule-workspace-header">Graph evidence</div>
        <p className="mt-2 text-sm text-gray-600">
          This view should later render matches, missing evidence, and graph objects once a BIM
          graph is attached.
        </p>
        <div className="mt-4 min-h-56 rounded-lg border border-dashed border-gray-300 bg-white p-4 text-sm text-gray-500">
          BIM graph not selected yet.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="rule-workspace-header">Reconstruction preview</div>
      <p className="mt-2 text-sm text-gray-600">
        This response area can render a canonical graph preview after reconstruction is connected.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {standards.map((standard) => (
          <div key={standard.id} className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="text-sm font-semibold text-gray-950">{standardLabel(standard)}</div>
            <div className="mt-2 text-xs text-gray-500">Canonical source candidate</div>
          </div>
        ))}
      </div>
      <div className="mt-5 font-mono text-xs text-gray-500">{activeAction.endpoint}</div>
    </div>
  );
}

export default function LexiconPage() {
  const { user, isLoading: authLoading } = useRequireAuth();
  const availableRules = useRuleBookStore((state: RuleBookStore) => state.available_rules);
  const runnerRuleItems = useRuleBookStore((state: RuleBookStore) => state.runner_rule_items);
  const addRuleToRunner = useRuleBookStore((state: RuleBookStore) => state.addRuleToRunner);
  const removeRuleFromRunner = useRuleBookStore(
    (state: RuleBookStore) => state.removeRuleFromRunner,
  );
  const moveRunnerItem = useRuleBookStore((state: RuleBookStore) => state.moveRunnerItem);
  const [mode, setMode] = useState<LexiconMode>('start');
  const [leftCollapsed, setLeftCollapsed] = useState(true);
  const [rightCollapsed, setRightCollapsed] = useState(true);
  const [drawerState, setDrawerState] = useState<DrawerState>('closed');
  const [activeProfileId, setActiveProfileId] = useState(profiles[0].id);
  const [activeTab, setActiveTab] = useState<InspectorTab>('coverage');
  const [rulePickerStarted, setRulePickerStarted] = useState(false);
  const [standardPickerStarted, setStandardPickerStarted] = useState(false);
  const [activeInspectView, setActiveInspectView] = useState<InspectView>('summary');
  const [availableStandards, setAvailableStandards] =
    useState<StandardSummary[]>(fallbackStandards);
  const [selectedStandards, setSelectedStandards] = useState<StandardSummary[]>([]);
  const [standardsLoading, setStandardsLoading] = useState(false);
  const [standardsError, setStandardsError] = useState<string | null>(null);
  const allNodes = useMemo(() => flattenNodes(requirementTree), []);
  const [selectedNodeId] = useState(allNodes[2].id);
  const selectedNode = allNodes.find((node) => node.id === selectedNodeId) || allNodes[0];
  const activeStartOption = startOptions.find((option) => option.id === mode);
  const isWorkspace = mode === 'workspace' || mode === 'inspect';
  const canContinueWithDraft =
    mode === 'rules' && runnerRuleItems.length > 0 && selectedStandards.length > 0;

  useEffect(() => {
    let cancelled = false;

    async function loadStandards() {
      setStandardsLoading(true);
      setStandardsError(null);

      try {
        const nextStandards = await listOntologyStandards();
        if (!cancelled) {
          setAvailableStandards(nextStandards);
        }
      } catch (error) {
        if (!cancelled) {
          setStandardsError(
            error instanceof Error
              ? error.message
              : 'Could not load standards from the ontologies API.',
          );
          setAvailableStandards(fallbackStandards);
        }
      } finally {
        if (!cancelled) {
          setStandardsLoading(false);
        }
      }
    }

    void loadStandards();

    return () => {
      cancelled = true;
    };
  }, []);

  if (authLoading || !user) {
    return (
      <Layout title="Loading... | FireBIM">
        <LoadingSpinner />
      </Layout>
    );
  }

  const drawerHeight = drawerState === 'closed' ? 'h-10' : drawerState === 'half' ? 'h-56' : 'h-96';

  const openMode = (nextMode: LexiconMode) => {
    setMode(nextMode);
    setLeftCollapsed(true);
    setRightCollapsed(true);
    setDrawerState('closed');
    setRulePickerStarted(false);
    setStandardPickerStarted(false);
    setActiveTab(nextMode === 'recommended' ? 'suggestions' : 'coverage');
  };

  const openWorkspace = () => {
    if (!canContinueWithDraft) return;
    setMode('inspect');
    setLeftCollapsed(true);
    setRightCollapsed(true);
    setDrawerState('closed');
    setActiveInspectView('summary');
  };

  const handleRuleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const payload = parseRuleDragPayload(event);
    if (!payload) return;

    if (payload.kind === 'rulebook-rule' && payload.rule_id) {
      const rule = availableRules.find((item: RuleListItem) => item.rule_id === payload.rule_id);
      if (!rule) return;
      addRuleToRunner(rule);
      return;
    }

    if (payload.kind === 'rulebook-runner-item' && typeof payload.from_index === 'number') {
      moveRunnerItem(payload.from_index, runnerRuleItems.length - 1);
    }
  };

  const openRuleLibrary = () => {
    setRulePickerStarted(true);
    setLeftCollapsed(false);
  };

  const openStandardLibrary = () => {
    setStandardPickerStarted(true);
    setRightCollapsed(false);
  };

  const addStandardToDraft = (standard: StandardSummary) => {
    setSelectedStandards((items) =>
      items.some((item) => item.id === standard.id) ? items : [...items, standard],
    );
  };

  const removeStandardFromDraft = (standard_id: string) => {
    setSelectedStandards((items) => items.filter((item) => item.id !== standard_id));
  };

  const handleStandardDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const payload = parseStandardDragPayload(event);
    if (!payload?.standard_id) return;

    const standard = availableStandards.find((item) => item.id === payload.standard_id);
    if (!standard) return;

    addStandardToDraft(standard);
  };

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
              <StepPill
                label="Start"
                done
                onClick={
                  mode === 'start'
                    ? undefined
                    : () => {
                        setMode('start');
                        setLeftCollapsed(true);
                        setRightCollapsed(true);
                        setDrawerState('closed');
                        setRulePickerStarted(false);
                        setStandardPickerStarted(false);
                      }
                }
              />
              <StepPill
                label={mode === 'start' ? 'Step 1 Select flow' : 'Step 1 Create from rules'}
                active={mode === 'start'}
                done={mode !== 'start'}
                onClick={
                  mode === 'rules' || mode === 'inspect'
                    ? () => {
                        setMode('start');
                        setLeftCollapsed(true);
                        setRightCollapsed(true);
                        setDrawerState('closed');
                      }
                    : undefined
                }
              />
              {(mode === 'rules' || mode === 'inspect') && (
                <StepPill
                  label="Step 2 Select sources"
                  active={mode === 'rules'}
                  done={mode === 'inspect'}
                  onClick={
                    mode === 'inspect'
                      ? () => {
                          setMode('rules');
                          setLeftCollapsed(true);
                          setRightCollapsed(true);
                          setDrawerState('closed');
                        }
                      : undefined
                  }
                />
              )}
              {mode === 'inspect' && <StepPill label="Step 3 Inspect profile" active />}
              <button
                type="button"
                disabled={!isWorkspace}
                className="inline-flex items-center gap-2 rounded-md bg-orange-600 px-3 py-2 font-semibold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                <PlayIcon className="h-4 w-4" />
                Run checks
              </button>
            </div>
          </div>
        </div>

        <div className="flex h-[78vh] min-h-[680px] overflow-hidden bg-gray-100">
          {mode === 'rules' ? (
            <RuleBookLibraryPanel
              collapsed={leftCollapsed}
              onToggleCollapsed={() => setLeftCollapsed((value) => !value)}
              showApiStatus={false}
            />
          ) : (
            <aside
              className={`flex shrink-0 flex-col border-r border-gray-200 bg-white transition-all ${
                leftCollapsed ? 'w-16' : 'w-80'
              }`}
            >
              <div className="flex items-center justify-between border-b border-gray-200 p-3">
                {!leftCollapsed && (
                  <div>
                    <div className="rule-workspace-header">{modeLabels[mode]}</div>
                    <p className="text-xs text-gray-500">
                      {mode === 'graph'
                        ? 'Choose a BIM graph'
                        : mode === 'standards'
                          ? 'Choose standards'
                          : 'Saved definition choices'}
                    </p>
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
                    <span className="text-xs text-gray-500">
                      Search profiles, rules, BIM graphs
                    </span>
                  </div>

                  {mode !== 'start' && mode !== 'workspace' && (
                    <div className="mb-3 rounded-lg border border-orange-200 bg-orange-50 p-3 text-xs text-orange-900">
                      {activeStartOption?.helper}
                    </div>
                  )}

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
                              {profile.rules} rules - {profile.mode} standards
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
          )}

          <section className="flex min-w-0 flex-1 flex-col">
            {!isWorkspace && (
              <div className="min-h-0 flex-1 overflow-auto bg-slate-100 p-6">
                <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col justify-center">
                  {mode === 'rules' ? (
                    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-4 px-6 py-5">
                        <div>
                          <div className="rule-workspace-header">Step 2</div>
                          <h1 className="mt-2 text-2xl font-semibold text-gray-950">
                            Create from rules
                          </h1>
                          <p className="mt-3 max-w-2xl text-sm text-gray-600">
                            Choose rules and standards. Lexicon uses them to draft a profile that
                            can be inspected before it is saved or shared.
                          </p>
                        </div>
                        {canContinueWithDraft && (
                          <button
                            type="button"
                            onClick={openWorkspace}
                            className="rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700"
                          >
                            Build profile
                          </button>
                        )}
                      </div>

                      <div
                        className="relative grid min-h-[520px] bg-slate-100 lg:grid-cols-2"
                        style={{
                          backgroundImage:
                            'radial-gradient(circle at 1px 1px, rgba(100,116,139,0.38) 1px, transparent 0)',
                          backgroundSize: '22px 22px',
                        }}
                      >
                        <div className="pointer-events-none absolute top-0 bottom-0 left-1/2 z-10 hidden w-12 -translate-x-1/2 items-center justify-center lg:flex">
                          <div className="absolute top-5 bottom-5 left-1/2 w-[3px] -translate-x-1/2 rounded-full bg-gradient-to-b from-transparent via-gray-500 to-transparent shadow-[0_0_16px_rgba(75,85,99,0.45)]" />
                          <div className="relative flex h-9 w-14 items-center justify-center rounded-full border border-gray-300 bg-slate-100/95 text-[11px] font-semibold tracking-tight text-gray-500 shadow-sm">
                            <span aria-hidden="true">{'<< >>'}</span>
                          </div>
                        </div>
                        <div
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={handleRuleDrop}
                          className="p-6"
                        >
                          {!rulePickerStarted && runnerRuleItems.length === 0 ? (
                            <div className="flex min-h-full items-center justify-center">
                              <div className="max-w-md rounded-xl border border-sky-200 bg-white/90 p-5 shadow-sm">
                                <div className="rule-workspace-header">Choose rules</div>
                                <p className="mt-2 text-sm text-gray-600">
                                  Start by selecting the machine-readable rules this profile should
                                  support. The Rule Library opens in the left panel, and the rules
                                  you drag in will stack here as the demand side of the profile.
                                </p>
                                <button
                                  type="button"
                                  onClick={openRuleLibrary}
                                  className="mt-4 inline-flex items-center gap-2 rounded-md bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-800"
                                >
                                  <BookOpenIcon className="h-4 w-4" />
                                  Open Rule Library
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="mb-4 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
                                Rule Library is available in the left panel. Drag rules into this
                                canvas area and reorder them vertically.
                              </div>
                              <LexiconRuleStack
                                items={runnerRuleItems}
                                onRemove={removeRuleFromRunner}
                                onMove={moveRunnerItem}
                              />
                            </>
                          )}
                        </div>

                        <div
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={handleStandardDrop}
                          className="p-6"
                        >
                          {!standardPickerStarted && selectedStandards.length === 0 ? (
                            <div className="flex min-h-full items-center justify-center">
                              <div className="max-w-md rounded-xl border border-orange-200 bg-white/90 p-5 shadow-sm">
                                <div className="rule-workspace-header">Choose standards</div>
                                <p className="mt-2 text-sm text-gray-600">
                                  Lexicon uses ontologies as standards. That means FBO, IFC, RIR and
                                  their versions provide consistent definitions for classes,
                                  properties, and later profile decisions. Open the Standard Library
                                  in the right panel and drag in the standards this profile should
                                  use.
                                </p>
                                <button
                                  type="button"
                                  onClick={openStandardLibrary}
                                  className="mt-4 inline-flex items-center gap-2 rounded-md bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-800"
                                >
                                  <FunnelIcon className="h-4 w-4" />
                                  Open Standard Library
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-4">
                              <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-900">
                                Standard Library is available in the right panel. Drag standards
                                here to define the language Lexicon should use for this profile.
                              </div>
                              <LexiconStandardStack
                                standards={selectedStandards}
                                onRemove={removeStandardFromDraft}
                              />
                              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                                <div className="rule-workspace-header">Draft preview</div>
                                <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                                  <div>
                                    <div className="text-xs font-semibold text-gray-500 uppercase">
                                      Rules
                                    </div>
                                    <div className="mt-1 text-lg font-semibold text-gray-950">
                                      {runnerRuleItems.length}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-xs font-semibold text-gray-500 uppercase">
                                      Standards
                                    </div>
                                    <div className="mt-1 text-lg font-semibold text-gray-950">
                                      {selectedStandards.length}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-xs font-semibold text-gray-500 uppercase">
                                      Definitions
                                    </div>
                                    <div className="mt-1 text-lg font-semibold text-gray-950">
                                      {runnerRuleItems.length *
                                        Math.max(selectedStandards.length, 1) *
                                        3}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="mb-6 text-center">
                        <div className="rule-workspace-header">Step 1</div>
                        <h1 className="mt-2 text-2xl font-semibold text-gray-950">
                          Create or open a Lexicon profile
                        </h1>
                        <p className="mx-auto mt-3 max-w-2xl text-sm text-gray-600">
                          Profiles save definition choices so they can be reused across rules,
                          standards, and BIM graphs.
                        </p>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {startOptions.map((option) => {
                          const Icon = option.icon;
                          const selected = mode === option.id;

                          return (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => openMode(option.id)}
                              className={`min-h-36 rounded-lg border bg-white p-4 text-left shadow-sm transition hover:border-orange-300 hover:shadow ${
                                selected
                                  ? 'border-orange-400 ring-2 ring-orange-100'
                                  : 'border-gray-200'
                              }`}
                            >
                              <div className="mb-3 flex items-center gap-3">
                                <span className="rounded-md border border-gray-200 bg-gray-50 p-2 text-gray-700">
                                  <Icon className="h-5 w-5" />
                                </span>
                                <span className="min-w-0 flex-1 text-sm font-semibold text-gray-950">
                                  {option.title}
                                </span>
                                {!option.available && (
                                  <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-semibold text-gray-500 uppercase">
                                    Work in progress
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-gray-600">{option.description}</p>
                            </button>
                          );
                        })}
                      </div>

                      {activeStartOption && mode !== 'start' && (
                        <div className="mt-5 rounded-lg border border-orange-200 bg-orange-50 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-orange-950">
                                {activeStartOption.title}
                              </div>
                              <p className="mt-1 text-sm text-orange-900">
                                {activeStartOption.helper}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={openWorkspace}
                              disabled
                              className="rounded-md bg-gray-300 px-3 py-2 text-sm font-semibold text-gray-500"
                            >
                              Continue with draft
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            <div
              className={`${mode === 'inspect' ? 'block' : 'hidden'} min-h-0 flex-1 overflow-auto bg-slate-100 p-6`}
            >
              <div className="mx-auto min-h-full w-full max-w-6xl rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="px-6 py-5">
                  <div className="rule-workspace-header">Step 3</div>
                  <h1 className="mt-2 text-2xl font-semibold text-gray-950">Inspect profile</h1>
                  <p className="mt-3 max-w-2xl text-sm text-gray-600">
                    Inspect the profile before saving. The actions below are shaped around the
                    Lexicon APIs for summary, coverage, recommendations, conformity, evidence, and
                    reconstruction.
                  </p>
                </div>

                <div
                  className="grid min-h-[540px] gap-0 bg-slate-100 lg:grid-cols-[minmax(220px,1fr)_minmax(0,3fr)]"
                  style={{
                    backgroundImage:
                      'radial-gradient(circle at 1px 1px, rgba(100,116,139,0.38) 1px, transparent 0)',
                    backgroundSize: '22px 22px',
                  }}
                >
                  <div className="p-5">
                    <div className="rounded-xl border border-gray-200 bg-white/90 p-4 shadow-sm">
                      <div className="rule-workspace-header">Profile group</div>
                      <div className="mt-4 flex flex-wrap gap-1.5">
                        {runnerRuleItems.map((rule, index) => (
                          <div
                            key={rule.runner_item_id}
                            title={rule.label}
                            className="h-7 w-7 rounded-md border border-sky-300 bg-sky-100 text-center text-[10px] leading-7 font-semibold text-sky-800"
                          >
                            R{index + 1}
                          </div>
                        ))}
                        {selectedStandards.map((standard, index) => (
                          <div
                            key={standard.id}
                            title={`${standard.title} ${standard.version}`}
                            className="h-7 w-7 rounded-md border border-orange-300 bg-orange-100 text-center text-[10px] leading-7 font-semibold text-orange-800"
                          >
                            O{index + 1}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-4 space-y-2">
                      {inspectActions.map((action) => (
                        <button
                          key={action.id}
                          type="button"
                          onClick={() => setActiveInspectView(action.id)}
                          className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                            activeInspectView === action.id
                              ? 'border-gray-900 bg-gray-900 text-white'
                              : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          <div className="font-semibold">{action.label}</div>
                          <div
                            className={`mt-1 text-xs ${
                              activeInspectView === action.id ? 'text-gray-200' : 'text-gray-500'
                            }`}
                          >
                            {action.endpoint}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="p-5 pl-0 max-lg:pl-5">
                    <div className="min-h-full rounded-xl border border-gray-200 bg-white/95 p-5 shadow-sm">
                      <InspectResponsePanel
                        view={activeInspectView}
                        ruleCount={runnerRuleItems.length}
                        standards={selectedStandards}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div
              className={`shrink-0 border-t border-gray-200 bg-white transition-all ${
                mode === 'workspace' ? drawerHeight : 'hidden'
              }`}
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

          {mode === 'rules' ? (
            <StandardLibraryPanel
              collapsed={rightCollapsed}
              standards={availableStandards}
              loading={standardsLoading}
              error={standardsError}
              onToggleCollapsed={() => setRightCollapsed((value) => !value)}
            />
          ) : (
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
                  {!isWorkspace ? (
                    <div className="space-y-4">
                      <div className="rounded-lg border border-orange-200 bg-orange-50 p-3">
                        <div className="flex items-start gap-2">
                          <SparklesIcon className="mt-0.5 h-4 w-4 shrink-0 text-orange-700" />
                          <div>
                            <div className="text-sm font-semibold text-orange-950">
                              {activeStartOption?.title || 'Start with a profile'}
                            </div>
                            <p className="mt-1 text-xs text-orange-900">
                              {activeStartOption?.helper ||
                                'Choose how you want to start. Lexicon will open only the panels you need.'}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-lg border border-gray-200 p-3">
                        <div className="rule-workspace-header mb-2">Recommended next step</div>
                        <p className="text-sm text-gray-600">
                          Pick one starting point in the center. You can stay lazy: Lexicon will
                          suggest standards, matches, and profile choices as you go.
                        </p>
                      </div>

                      {mode !== 'start' && (
                        <button
                          type="button"
                          onClick={openWorkspace}
                          disabled={!canContinueWithDraft}
                          className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
                        >
                          Continue with draft
                        </button>
                      )}
                    </div>
                  ) : (
                    <>
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
                            <div
                              key={item}
                              className="rounded-md border border-gray-200 p-3 text-sm"
                            >
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
                            This profile can run partial checks, but missing targets should be
                            resolved before publishing the final profile variant.
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
                    </>
                  )}
                </div>
              )}
            </aside>
          )}
        </div>
      </div>
    </Layout>
  );
}

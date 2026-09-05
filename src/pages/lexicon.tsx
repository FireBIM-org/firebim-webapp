import type { ReactNode } from 'react';

import {
  ArrowPathIcon,
  ArrowUpTrayIcon,
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
import { signIn } from 'next-auth/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { RuleListItem, RuleRunnerItem } from '@/features/rulebook/types';

import Layout from '@/components/Layout';
import LoadingSpinner from '@/components/LoadingSpinner';
import { env } from '@/config/env';
import {
  getOntologyLibrary,
  OFFICIAL_FIREBIM_ONTOLOGY_INDEX,
  refreshOntologyLibrary,
  rememberUserOntology,
} from '@/features/ontologies/library';
import { getRulesHealth, listRules } from '@/features/rulebook/api';
import RuleBookLibraryPanel from '@/features/rulebook/components/RuleBookLibraryPanel';
import { useRuleBookStore, type RuleBookStore } from '@/features/rulebook/store';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import apiClient from '@/utils/api-client';

type CoverageState = 'covered' | 'partial' | 'missing' | 'suggested';
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
  | 'save'
  | 'graphCoverage'
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

type RuleTermDescriptor = {
  value: string;
  full_iri: string;
  namespace: string;
  local_name: string;
};

type RuleTermLocalNameGroup = {
  local_name: string;
  count: number;
  full_iris?: string[];
  namespaces?: string[];
};

type RuleTermStats = {
  rule_count: number;
  element_count: number;
  unique_target_classes: number;
  unique_property_paths: number;
  unique_target_property_pairs: number;
  target_class_local_name_collisions: number;
  property_path_local_name_collisions: number;
};

type RuleTermsResponse = {
  rule_id: string;
  target_classes?: RuleTermDescriptor[];
  property_paths?: RuleTermDescriptor[];
  target_class_local_name_groups?: RuleTermLocalNameGroup[];
  property_path_local_name_groups?: RuleTermLocalNameGroup[];
  stats: RuleTermStats;
};

type RuleTermsAggregateResponse = {
  rule_ids?: string[];
  target_classes?: RuleTermDescriptor[];
  property_paths?: RuleTermDescriptor[];
  target_class_local_name_groups?: RuleTermLocalNameGroup[];
  property_path_local_name_groups?: RuleTermLocalNameGroup[];
  stats: RuleTermStats;
};

type ProfileAutosaveState = 'idle' | 'saving' | 'saved' | 'error';
type ProfileDeriveState = 'idle' | 'deriving' | 'derived' | 'error';

type ProfileAutosaveMetrics = {
  durationMs: number;
  payloadBytes: number;
  status: number | null;
  method: 'POST' | 'PUT';
  endpoint: string;
  savedAt: Date;
};

type DerivedProfileData = {
  ontology_family?: string;
  country?: string;
  version?: string;
  canonical_family_uri?: string;
  canonical_country_uri?: string;
  selected_ontologies?: Array<Record<string, unknown>>;
  canonical_target_ontology?: Record<string, unknown> | null;
  rule_ids?: string[];
  profile?: Record<string, unknown>;
  rule_profiles?: Array<Record<string, unknown>>;
};

type RuleCoverageProperty = {
  target_class: string;
  property_path: string;
  node_ids?: string[];
};

type RuleCoverageItem = {
  rule_id: string;
  supported: boolean;
  complete: boolean;
  missing_target_classes?: string[];
  missing_properties?: RuleCoverageProperty[];
};

type ProfileRulesCoverageResponse = {
  profile_id: string;
  checked_rule_ids?: string[];
  fully_supported_rule_ids?: string[];
  partially_supported_rules?: RuleCoverageItem[];
  unsupported_rule_ids?: string[];
};

type CoverageCandidate = {
  missingTerm: string;
  kind: 'Class' | 'Property';
  ruleId: string;
  exact: boolean;
  candidateKind: string;
  standardId: string;
  standardLabel: string;
  termId: string;
  label: string;
  uri: string;
  score: number | null;
};

type NormalizedTermType = 'class' | 'subclass' | 'property' | 'set' | 'unknown';

type RuleOntologySimilaritySourceTerm = {
  term_kind: string;
  value: string;
  full_iri: string;
  namespace: string;
  local_name: string;
  node_ids?: string[];
};

type RuleOntologySimilarityMatch = {
  ontology_family: string;
  country: string;
  version: string;
  term_id: string;
  uri: string;
  kind: string;
  label?: string | null;
  value: string;
  full_iri: string;
  namespace: string;
  local_name: string;
  score: number;
  notes?: string[];
};

type RuleOntologySimilarityTermResult = {
  source_term: RuleOntologySimilaritySourceTerm;
  match_count: number;
  matches?: RuleOntologySimilarityMatch[];
};

type RuleOntologySimilarityRuleResult = {
  rule_id: string;
  target_classes?: RuleOntologySimilarityTermResult[];
  property_paths?: RuleOntologySimilarityTermResult[];
};

type RuleOntologySimilarityResponse = {
  rule_ids?: string[];
  limit_per_term: number;
  results?: RuleOntologySimilarityRuleResult[];
};

type ProfileDefinitionTerm = RuleTermDescriptor & {
  id: string;
  term_kind: 'Class' | 'Property';
  rule_ids: string[];
  duplicate: boolean;
};

type LexiconWorkflowSnapshot = {
  version: 1;
  updated_at: string;
  mode: LexiconMode;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  drawerState: DrawerState;
  rulePickerStarted: boolean;
  standardPickerStarted: boolean;
  activeInspectView: InspectView;
  touchedInspectActions: InspectView[];
  selectedStandards: StandardSummary[];
  canonicalStandardId: string | null;
  draftProfileId: string | null;
  profileName: string;
  profileNameTouched: boolean;
  profileDescription: string;
  profileKeywords: string;
  candidateLimit: number;
  similarityThreshold: number;
  runnerRuleItems: RuleRunnerItem[];
  derivedProfile: DerivedProfileData | null;
};

type RecentAutosaveProfile = {
  id: string;
  name: string;
  saved_at: string;
};

const LEXICON_WORKFLOW_STORAGE_KEY = 'firebim-lexicon-workflow-v1';
const LEXICON_RECENT_AUTOSAVES_STORAGE_KEY = 'firebim-lexicon-recent-autosaves-v1';
const LEXICON_RECENT_AUTOSAVE_LIMIT = 5;
const lexiconModes: LexiconMode[] = [
  'start',
  'rules',
  'graph',
  'profiles',
  'standards',
  'recommended',
  'workspace',
  'inspect',
];
const drawerStates: DrawerState[] = ['closed', 'half', 'full'];
const inspectViews: InspectView[] = [
  'summary',
  'coverage',
  'choices',
  'save',
  'graphCoverage',
  'readiness',
  'conformity',
  'evidence',
  'reconstruction',
];

const ruleColorClasses = [
  'bg-sky-500',
  'bg-emerald-500',
  'bg-violet-500',
  'bg-rose-500',
  'bg-amber-500',
  'bg-cyan-500',
  'bg-lime-500',
  'bg-fuchsia-500',
];

function ruleColorClass(index: number) {
  return ruleColorClasses[index % ruleColorClasses.length];
}

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

type StandardSource = (typeof standardSources)[number];

function ontologyStandardSources(): StandardSource[] {
  return getOntologyLibrary().map((entry) => ({
    ontology_family: entry.ontology_family,
    country: entry.country,
    fallback_version: entry.version,
  }));
}

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

async function fetchWithTimeout(url: string, timeoutMs = 4500) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}

function coerceLexiconWorkflowSnapshot(input: unknown): LexiconWorkflowSnapshot | null {
  const raw = input as Partial<LexiconWorkflowSnapshot> | null;

  if (!raw || raw.version !== 1 || !lexiconModes.includes(raw.mode as LexiconMode)) {
    return null;
  }

  const restoredMode = raw.mode as LexiconMode;
  const selectedStandards = Array.isArray(raw.selectedStandards) ? raw.selectedStandards : [];
  const runnerRuleItems = Array.isArray(raw.runnerRuleItems) ? raw.runnerRuleItems : [];
  const canInspect = runnerRuleItems.length > 0 && selectedStandards.length > 0;
  const mode: LexiconMode = restoredMode === 'inspect' && !canInspect ? 'rules' : restoredMode;

  return {
    version: 1,
    updated_at: typeof raw.updated_at === 'string' ? raw.updated_at : new Date().toISOString(),
    mode,
    leftCollapsed: typeof raw.leftCollapsed === 'boolean' ? raw.leftCollapsed : true,
    rightCollapsed: typeof raw.rightCollapsed === 'boolean' ? raw.rightCollapsed : true,
    drawerState: drawerStates.includes(raw.drawerState as DrawerState)
      ? (raw.drawerState as DrawerState)
      : 'closed',
    rulePickerStarted:
      typeof raw.rulePickerStarted === 'boolean'
        ? raw.rulePickerStarted
        : runnerRuleItems.length > 0,
    standardPickerStarted:
      typeof raw.standardPickerStarted === 'boolean'
        ? raw.standardPickerStarted
        : selectedStandards.length > 0,
    activeInspectView: inspectViews.includes(raw.activeInspectView as InspectView)
      ? (raw.activeInspectView as InspectView)
      : 'summary',
    touchedInspectActions: Array.isArray(raw.touchedInspectActions)
      ? raw.touchedInspectActions.filter((item): item is InspectView =>
          inspectViews.includes(item as InspectView),
        )
      : [],
    selectedStandards,
    canonicalStandardId:
      typeof raw.canonicalStandardId === 'string' ? raw.canonicalStandardId : null,
    draftProfileId: typeof raw.draftProfileId === 'string' ? raw.draftProfileId : null,
    profileName: typeof raw.profileName === 'string' ? raw.profileName : '',
    profileNameTouched:
      typeof raw.profileNameTouched === 'boolean' ? raw.profileNameTouched : false,
    profileDescription: typeof raw.profileDescription === 'string' ? raw.profileDescription : '',
    profileKeywords:
      typeof raw.profileKeywords === 'string' ? raw.profileKeywords : 'rules, standards',
    candidateLimit: typeof raw.candidateLimit === 'number' ? raw.candidateLimit : 3,
    similarityThreshold: typeof raw.similarityThreshold === 'number' ? raw.similarityThreshold : 0,
    runnerRuleItems,
    derivedProfile:
      raw.derivedProfile && typeof raw.derivedProfile === 'object'
        ? (raw.derivedProfile as DerivedProfileData)
        : null,
  };
}

function readLexiconWorkflowSnapshot(): LexiconWorkflowSnapshot | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(LEXICON_WORKFLOW_STORAGE_KEY);
    if (!raw) return null;
    return coerceLexiconWorkflowSnapshot(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeLexiconWorkflowSnapshot(snapshot: LexiconWorkflowSnapshot) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(LEXICON_WORKFLOW_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // The workflow checkpoint is best-effort; backend autosave still owns profile persistence.
  }
}

function readRecentAutosaveProfiles(): RecentAutosaveProfile[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(LEXICON_RECENT_AUTOSAVES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<RecentAutosaveProfile>[];

    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item): item is RecentAutosaveProfile =>
        Boolean(
          item &&
          typeof item.id === 'string' &&
          typeof item.name === 'string' &&
          typeof item.saved_at === 'string',
        ),
      )
      .sort((a, b) => Date.parse(b.saved_at) - Date.parse(a.saved_at));
  } catch {
    return [];
  }
}

function rememberRecentAutosaveProfile(profile: RecentAutosaveProfile) {
  if (typeof window === 'undefined') return [];

  const next = [
    profile,
    ...readRecentAutosaveProfiles().filter((item) => item.id !== profile.id),
  ].sort((a, b) => Date.parse(b.saved_at) - Date.parse(a.saved_at));
  const retained = next.slice(0, LEXICON_RECENT_AUTOSAVE_LIMIT);
  const pruned = next.slice(LEXICON_RECENT_AUTOSAVE_LIMIT);

  try {
    window.localStorage.setItem(LEXICON_RECENT_AUTOSAVES_STORAGE_KEY, JSON.stringify(retained));
  } catch {
    // Best-effort cleanup metadata only.
  }

  return pruned;
}

async function deleteAutosaveProfiles(profileIds: string[]) {
  for (const profileId of profileIds) {
    try {
      await fetch(`${env.apiBaseUrl}/lexicon/profiles/${encodeURIComponent(profileId)}`, {
        method: 'DELETE',
      });
    } catch {
      // Cleanup is opportunistic; failed deletes should not block the user.
    }
  }
}

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

type InspectAction = {
  id: InspectView;
  label: string;
  description: string;
  endpoint: string;
  phase?: 'review' | 'profile' | 'graph' | 'advanced';
};

const createFromRulesInspectActions: InspectAction[] = [
  {
    id: 'summary',
    label: 'Profile summary',
    description: 'Review rules, standards, and draft definitions before saving.',
    endpoint: 'POST /lexicon/profiles/summary',
    phase: 'review',
  },
  {
    id: 'coverage',
    label: 'Check rule support',
    description: 'Check which selected rules the profile can support.',
    endpoint: 'POST /lexicon/profiles/{profile_id}/rules/coverage',
    phase: 'review',
  },
  {
    id: 'choices',
    label: 'Review suggested choices',
    description: 'Review candidate definition choices the user can accept or reject.',
    endpoint: 'GET /lexicon/profiles/{profile_id}/mappings/candidates',
    phase: 'review',
  },
  {
    id: 'save',
    label: 'Save profile',
    description: 'Save this draft profile so it can be reused and shared.',
    endpoint: 'POST /lexicon/profiles',
    phase: 'profile',
  },
  {
    id: 'graphCoverage',
    label: 'Compare with BIM graph',
    description: 'Compare the saved profile with a selected BIM representation.',
    endpoint: 'POST /lexicon/profiles/{profile_id}/graph-coverage',
    phase: 'graph',
  },
  {
    id: 'readiness',
    label: 'Check readiness',
    description: 'Estimate whether the profile is ready to use for checks.',
    endpoint: 'POST /lexicon/profiles/summary',
    phase: 'graph',
  },
  {
    id: 'conformity',
    label: 'Advanced: Conformity',
    description: 'Run semantic and structural validity checks for the current profile.',
    endpoint: 'POST /lexicon/conformity/check',
    phase: 'advanced',
  },
  {
    id: 'evidence',
    label: 'Advanced: Graph evidence',
    description: 'Summarize classes, properties, and subjects in a selected BIM graph.',
    endpoint: 'POST /lexicon/graphs/evidence-summary',
    phase: 'advanced',
  },
  {
    id: 'reconstruction',
    label: 'Advanced: Reconstruction',
    description: 'Preview how the selected standards can support a canonical graph.',
    endpoint: 'POST /lexicon/reconstruction',
    phase: 'advanced',
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

function normalizeStandardSummary(input: unknown, fallback: StandardSource) {
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
  let library = getOntologyLibrary();
  try {
    library = await refreshOntologyLibrary();
  } catch {
    // Keep the cached and built-in entries available while the API is offline.
  }

  return Promise.all(
    library.map(async (entry) => {
      const source: StandardSource = {
        ontology_family: entry.ontology_family,
        country: entry.country,
        fallback_version: entry.version,
      };
      try {
        return await loadOntologyStandard(source, 4500);
      } catch {
        return normalizeStandardSummary(
          { version: source.fallback_version, status: 'fallback' },
          source,
        );
      }
    }),
  );
}

async function loadOntologyStandard(
  source: StandardSource,
  timeoutMs = 15000,
): Promise<StandardSummary> {
  const overviewResponse = await fetchWithTimeout(
    `${env.apiBaseUrl}/ontologies/${source.ontology_family}/${source.country}`,
    timeoutMs,
  );

  if (!overviewResponse.ok) {
    throw new Error(`Could not load ${source.ontology_family}/${source.country}`);
  }

  const overview = (await overviewResponse.json()) as Record<string, unknown>;
  const version = String(overview.default_version ?? overview.latest_version ?? 'latest');
  const summaryResponse = await fetchWithTimeout(
    `${env.apiBaseUrl}/ontologies/${source.ontology_family}/${source.country}/versions/${version}/summary`,
    timeoutMs,
  );

  if (!summaryResponse.ok) {
    return normalizeStandardSummary({ ...overview, version, status: 'available' }, source);
  }

  return normalizeStandardSummary(await summaryResponse.json(), source);
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
  loadingStandardIds,
  error,
  onLoadStandard,
  onLibraryChanged,
  onToggleCollapsed,
}: {
  collapsed: boolean;
  standards: StandardSummary[];
  loading: boolean;
  loadingStandardIds: Set<string>;
  error: string | null;
  onLoadStandard: (standard: StandardSummary) => void;
  onLibraryChanged: () => Promise<void>;
  onToggleCollapsed: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadFamily, setUploadFamily] = useState('custom');
  const [uploadCountry, setUploadCountry] = useState('user');
  const [uploadVersion, setUploadVersion] = useState(today.replaceAll('-', '.'));

  const messageFromError = (caught: unknown) => {
    const candidate = caught as {
      response?: { data?: { detail?: unknown } };
      message?: unknown;
    };
    const detail = candidate?.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (typeof candidate?.message === 'string') return candidate.message;
    return 'Unexpected ontology operation error.';
  };

  const syncOfficialOntologies = async () => {
    setSyncing(true);
    setSyncMessage(null);
    setSyncError(null);
    try {
      const result = await apiClient.runOntologySync({
        source_url: OFFICIAL_FIREBIM_ONTOLOGY_INDEX,
        include_unlisted: true,
        latest_only: true,
        overwrite: false,
        dry_run: false,
      });
      setSyncMessage(
        `Sync complete: ${result.published} published, ${result.current} current, ${result.failed} failed.`,
      );
      await onLibraryChanged();
    } catch (caught) {
      setSyncError(messageFromError(caught));
    } finally {
      setSyncing(false);
    }
  };

  const uploadOntology = async () => {
    if (!uploadFile || !uploadFamily.trim() || !uploadCountry.trim() || !uploadVersion.trim()) {
      setUploadError('Choose a file and complete family, country/namespace, and version.');
      return;
    }

    const lowerName = uploadFile.name.toLowerCase();
    if (!lowerName.endsWith('.ttl') && !lowerName.endsWith('.json')) {
      setUploadError('Ontology uploads must be Turtle (.ttl) or dictionary JSON (.json).');
      return;
    }

    setUploading(true);
    setUploadMessage(null);
    setUploadError(null);
    try {
      const content = await uploadFile.text();
      if (lowerName.endsWith('.json')) {
        const dictionaryJson = JSON.parse(content) as unknown;
        if (
          !dictionaryJson ||
          typeof dictionaryJson !== 'object' ||
          Array.isArray(dictionaryJson)
        ) {
          throw new Error('The JSON ontology must contain a dictionary object at its root.');
        }
        const result = await apiClient.convertAndPublishOntologyDictionary({
          ontology_family: uploadFamily.trim(),
          country: uploadCountry.trim(),
          version: uploadVersion.trim(),
          dictionary_json: dictionaryJson as Record<string, unknown>,
          source_resource_filename: uploadFile.name,
          output_resource_filename: uploadFile.name.replace(/\.json$/i, '.ttl'),
          publish: true,
          status: 'draft',
          issued_at: today,
          default_version: false,
        });
        setUploadMessage(
          `${result.ontology_family}/${result.country}/${result.version} converted and published (${result.class_count} classes, ${result.property_count} properties).`,
        );
      } else {
        const result = await apiClient.publishOntology({
          ontology_family: uploadFamily.trim(),
          country: uploadCountry.trim(),
          version: uploadVersion.trim(),
          status: 'draft',
          issued_at: today,
          ttl: content,
          resource_filename: uploadFile.name,
          default_version: false,
        });
        setUploadMessage(
          `${result.ontology_family}/${result.country}/${result.version} published (${result.triple_count} triples).`,
        );
      }
      rememberUserOntology({
        id: `${uploadFamily.trim()}/${uploadCountry.trim()}/${uploadVersion.trim()}`,
        ontology_family: uploadFamily.trim(),
        country: uploadCountry.trim(),
        version: uploadVersion.trim(),
        label: `${uploadFamily.trim().toUpperCase()} ${uploadCountry.trim().toUpperCase()}`,
        description: `User ontology uploaded from ${uploadFile.name}.`,
      });
      await onLibraryChanged();
    } catch (caught) {
      setUploadError(messageFromError(caught));
    } finally {
      setUploading(false);
    }
  };

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
        <div className="mb-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void syncOfficialOntologies()}
            disabled={syncing}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-orange-300 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-800 hover:bg-orange-100 disabled:cursor-wait disabled:opacity-60"
          >
            <ArrowPathIcon className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing…' : 'Sync official FireBIM'}
          </button>
          <button
            type="button"
            onClick={() => setUploadOpen((open) => !open)}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            aria-expanded={uploadOpen}
          >
            <ArrowUpTrayIcon className="h-4 w-4" />
            Upload ontology
          </button>
        </div>

        {syncMessage ? (
          <div className="mb-3 rounded-md border border-green-200 bg-green-50 p-2 text-xs text-green-800">
            {syncMessage}
          </div>
        ) : null}
        {syncError ? (
          <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">
            Sync failed: {syncError}
          </div>
        ) : null}

        {uploadOpen ? (
          <div className="mb-4 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div>
              <div className="text-xs font-semibold text-gray-900">Upload a personal ontology</div>
              <p className="mt-1 text-[11px] text-gray-500">
                Turtle is published directly. Dictionary JSON is converted to Turtle by the API and
                then published as a draft.
              </p>
            </div>
            <input
              type="file"
              accept=".ttl,.json,text/turtle,application/json"
              onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
              className="block w-full text-xs text-gray-600 file:mr-2 file:rounded-md file:border-0 file:bg-white file:px-2 file:py-1 file:text-xs file:font-semibold"
            />
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] font-medium text-gray-600">
                Family
                <input
                  value={uploadFamily}
                  onChange={(event) => setUploadFamily(event.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs"
                />
              </label>
              <label className="text-[11px] font-medium text-gray-600">
                Country / namespace
                <input
                  value={uploadCountry}
                  onChange={(event) => setUploadCountry(event.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs"
                />
              </label>
            </div>
            <label className="block text-[11px] font-medium text-gray-600">
              Version (YYYY.MM or YYYY.MM.DD)
              <input
                value={uploadVersion}
                onChange={(event) => setUploadVersion(event.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 font-mono text-xs"
              />
            </label>
            {uploadMessage ? (
              <div className="rounded-md border border-green-200 bg-green-50 p-2 text-xs text-green-800">
                {uploadMessage}
              </div>
            ) : null}
            {uploadError ? (
              <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">
                {uploadError}
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => void uploadOntology()}
              disabled={uploading || !uploadFile}
              className="w-full rounded-md bg-orange-600 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploading ? 'Uploading…' : 'Convert / publish ontology'}
            </button>
          </div>
        ) : null}

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
          {standards.map((standard) => {
            const isLoadingStandard = loadingStandardIds.has(standard.id);

            return (
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
                    <p className="mt-1 line-clamp-2 text-xs text-gray-500">
                      {standard.description}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onLoadStandard(standard);
                      }}
                      disabled={isLoadingStandard}
                      className="rounded-md border border-gray-200 bg-white p-1.5 text-gray-500 hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700 disabled:cursor-wait disabled:opacity-60"
                      title="Load this standard"
                      aria-label={`Load ${standard.title || standardLabel(standard)}`}
                    >
                      <ArrowPathIcon
                        className={`h-3.5 w-3.5 ${isLoadingStandard ? 'animate-spin' : ''}`}
                      />
                    </button>
                    <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-semibold text-gray-500 uppercase">
                      {isLoadingStandard ? 'loading' : standard.status}
                    </span>
                  </div>
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
            );
          })}
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

function ProfileSummaryAccordion({
  title,
  count,
  tone,
  defaultOpen,
  children,
}: {
  title: string;
  count: number;
  tone: 'rules' | 'standards' | 'definitions';
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const toneClass =
    tone === 'rules'
      ? 'border-sky-200 bg-sky-50 text-sky-900'
      : tone === 'standards'
        ? 'border-orange-200 bg-orange-50 text-orange-900'
        : 'border-gray-200 bg-gray-50 text-gray-900';

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50"
      >
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-950">{title}</div>
          <div className="mt-1 text-xs text-gray-500">
            {count} {count === 1 ? 'item' : 'items'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${toneClass}`}>
            {count}
          </span>
          {open ? (
            <ChevronDoubleUpIcon className="h-4 w-4 text-gray-500" />
          ) : (
            <ChevronDoubleDownIcon className="h-4 w-4 text-gray-500" />
          )}
        </div>
      </button>
      {open && <div className="border-t border-gray-100 p-3">{children}</div>}
    </div>
  );
}

function ProfileSummarySourceCard({
  title,
  count,
  tone,
  children,
}: {
  title: string;
  count: number;
  tone: 'rules' | 'standards';
  children: ReactNode;
}) {
  const toneClass =
    tone === 'rules'
      ? 'border-sky-200 bg-sky-50 text-sky-900'
      : 'border-orange-200 bg-orange-50 text-orange-900';

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-gray-950">{title}</div>
          <div className="mt-1 text-xs text-gray-500">
            {count} {count === 1 ? 'item' : 'items'}
          </div>
        </div>
        <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${toneClass}`}>
          {count}
        </span>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function shortNamespace(value: string) {
  if (!value) return '';
  const normalized = value.replace(/[#/]+$/, '');
  return normalized.split(/[#/]/).filter(Boolean).pop() ?? value;
}

function shortTermName(value: string) {
  if (!value) return 'Unknown';
  const normalized = value.replace(/[>)]$/, '').replace(/[#/]+$/, '');
  return normalized.split(/[#/:]/).filter(Boolean).pop() ?? value;
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function coveragePercent(total: number, missing: number) {
  if (total <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round(((total - missing) / total) * 100)));
}

function normalizeTermType(value: string | null | undefined): NormalizedTermType {
  const normalized = (value ?? '').toLowerCase().replace(/[_\s-]+/g, '');

  if (normalized.includes('subclass')) return 'subclass';
  if (normalized.includes('propertyset') || normalized === 'set' || normalized.includes('pset')) {
    return 'set';
  }
  if (normalized.includes('property')) return 'property';
  if (normalized.includes('class')) return 'class';

  return 'unknown';
}

function ruleKindToTermType(kind: CoverageCandidate['kind']): NormalizedTermType {
  return kind === 'Class' ? 'class' : 'property';
}

function termTypesAreCompatible(ruleType: NormalizedTermType, ontologyType: NormalizedTermType) {
  if (ruleType === 'unknown' || ontologyType === 'unknown') return false;
  if (ruleType === ontologyType) return true;

  return (
    (ruleType === 'class' && ontologyType === 'subclass') ||
    (ruleType === 'subclass' && ontologyType === 'class')
  );
}

function sourceTermKey(value: string) {
  return shortTermName(value).toLowerCase();
}

function sourceTermMatches(term: string, source: RuleOntologySimilaritySourceTerm) {
  const wanted = sourceTermKey(term);
  return [source.value, source.full_iri, source.local_name]
    .filter(Boolean)
    .some((value) => sourceTermKey(value) === wanted);
}

function matchIsExactForSource(
  source: RuleOntologySimilaritySourceTerm,
  match: RuleOntologySimilarityMatch,
) {
  const sourceType = normalizeTermType(source.term_kind);
  const matchType = normalizeTermType(match.kind);

  return (
    termTypesAreCompatible(sourceType, matchType) &&
    source.local_name.length > 0 &&
    source.local_name.toLowerCase() === match.local_name.toLowerCase()
  );
}

async function fetchRuleOntologyCandidates(
  ruleIds: string[],
  terms: { term: string; kind: CoverageCandidate['kind'] }[],
  standards: StandardSummary[],
  limit: number,
): Promise<CoverageCandidate[]> {
  const selectedRuleIds = uniqueValues(ruleIds);
  if (selectedRuleIds.length === 0) return [];

  const response = await fetch(`${env.apiBaseUrl}/lexicon/catalog/rule-ontology-similarity`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rule_ids: selectedRuleIds,
      selected_ontologies: standards.map((standard) => ({
        ontology_family: standard.ontology_family,
        country: standard.country,
        version: standard.version,
      })),
      limit_per_term: limit,
      compact_terms: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Rule ontology similarity failed: ${response.status}`);
  }

  const similarity = (await response.json()) as RuleOntologySimilarityResponse;
  const wantedTerms = terms.length > 0 ? terms : [];
  const candidates: CoverageCandidate[] = [];

  (similarity.results ?? []).forEach((result) => {
    const termGroups: {
      kind: CoverageCandidate['kind'];
      items: RuleOntologySimilarityTermResult[];
    }[] = [
      { kind: 'Class', items: result.target_classes ?? [] },
      { kind: 'Property', items: result.property_paths ?? [] },
    ];

    termGroups.forEach(({ kind, items }) => {
      items.forEach((item) => {
        const wanted = wantedTerms.find(
          (term) => term.kind === kind && sourceTermMatches(term.term, item.source_term),
        );

        if (wantedTerms.length > 0 && !wanted) return;

        const missingTerm = wanted?.term ?? item.source_term.full_iri ?? item.source_term.value;
        (item.matches ?? [])
          .sort((a, b) => {
            const aExact = matchIsExactForSource(item.source_term, a);
            const bExact = matchIsExactForSource(item.source_term, b);

            return Number(bExact) - Number(aExact) || b.score - a.score;
          })
          .slice(0, limit)
          .forEach((match) => {
            const standard =
              standards.find(
                (item) =>
                  item.ontology_family === match.ontology_family &&
                  item.country === match.country &&
                  item.version === match.version,
              ) ?? null;
            candidates.push({
              missingTerm,
              kind,
              ruleId: result.rule_id,
              exact: matchIsExactForSource(item.source_term, match),
              candidateKind: match.kind,
              standardId:
                standard?.id ?? `${match.ontology_family}/${match.country}/${match.version}`,
              standardLabel:
                standard?.title ||
                (standard ? standardLabel(standard) : match.ontology_family.toUpperCase()),
              termId: match.term_id,
              label: match.label || match.local_name || shortTermName(match.term_id),
              uri: match.uri || match.full_iri,
              score: match.score,
            });
          });
      });
    });
  });

  return candidates.sort(
    (a, b) =>
      a.missingTerm.localeCompare(b.missingTerm) ||
      (b.score ?? -1) - (a.score ?? -1) ||
      a.label.localeCompare(b.label),
  );
}

function termKey(term: RuleTermDescriptor) {
  return `${term.full_iri || term.value}`;
}

function localNameGroups(terms: RuleTermDescriptor[]): RuleTermLocalNameGroup[] {
  const groups = new Map<string, RuleTermDescriptor[]>();

  terms.forEach((term) => {
    const group = groups.get(term.local_name) ?? [];
    group.push(term);
    groups.set(term.local_name, group);
  });

  return Array.from(groups.entries()).map(([local_name, group]) => ({
    local_name,
    count: group.length,
    full_iris: uniqueValues(group.map((term) => term.full_iri)),
    namespaces: uniqueValues(group.map((term) => term.namespace)),
  }));
}

function synthesizeAggregateTerms(responses: RuleTermsResponse[]): RuleTermsAggregateResponse {
  const targetClasses = Array.from(
    new Map(
      responses
        .flatMap((response) => response.target_classes ?? [])
        .map((term) => [termKey(term), term]),
    ).values(),
  );
  const propertyPaths = Array.from(
    new Map(
      responses
        .flatMap((response) => response.property_paths ?? [])
        .map((term) => [termKey(term), term]),
    ).values(),
  );
  const targetClassGroups = localNameGroups(targetClasses);
  const propertyPathGroups = localNameGroups(propertyPaths);

  return {
    rule_ids: responses.map((response) => response.rule_id),
    target_classes: targetClasses,
    property_paths: propertyPaths,
    target_class_local_name_groups: targetClassGroups,
    property_path_local_name_groups: propertyPathGroups,
    stats: {
      rule_count: responses.length,
      element_count: responses.reduce(
        (total, response) => total + (response.stats?.element_count ?? 0),
        0,
      ),
      unique_target_classes: targetClasses.length,
      unique_property_paths: propertyPaths.length,
      unique_target_property_pairs: 0,
      target_class_local_name_collisions: targetClassGroups.filter(
        (group) => (group.full_iris?.length ?? 0) > 1 || (group.namespaces?.length ?? 0) > 1,
      ).length,
      property_path_local_name_collisions: propertyPathGroups.filter(
        (group) => (group.full_iris?.length ?? 0) > 1 || (group.namespaces?.length ?? 0) > 1,
      ).length,
    },
  };
}

function buildDefinitionTerms(
  aggregate: RuleTermsAggregateResponse | null,
  perRuleTerms: Record<string, RuleTermsResponse>,
): ProfileDefinitionTerm[] {
  if (!aggregate) return [];

  const duplicateLocalNames = new Set<string>();
  const collectDuplicates = (groups?: RuleTermLocalNameGroup[]) => {
    (groups ?? []).forEach((group) => {
      const fullIris = group.full_iris ?? [];
      const namespaces = group.namespaces ?? [];
      if (fullIris.length > 1 || namespaces.length > 1) {
        duplicateLocalNames.add(group.local_name);
      }
    });
  };

  collectDuplicates(aggregate.target_class_local_name_groups);
  collectDuplicates(aggregate.property_path_local_name_groups);

  const ruleIdsByTerm = new Map<string, Set<string>>();
  Object.entries(perRuleTerms).forEach(([ruleId, response]) => {
    [...(response.target_classes ?? []), ...(response.property_paths ?? [])].forEach((term) => {
      const key = termKey(term);
      const existing = ruleIdsByTerm.get(key) ?? new Set<string>();
      existing.add(ruleId);
      ruleIdsByTerm.set(key, existing);
    });
  });

  return [
    ...(aggregate.target_classes ?? []).map((term) => ({ term, term_kind: 'Class' as const })),
    ...(aggregate.property_paths ?? []).map((term) => ({ term, term_kind: 'Property' as const })),
  ]
    .map(({ term, term_kind }) => ({
      ...term,
      id: `${term_kind}:${termKey(term)}`,
      term_kind,
      rule_ids: Array.from(ruleIdsByTerm.get(termKey(term)) ?? []),
      duplicate: duplicateLocalNames.has(term.local_name),
    }))
    .sort(
      (a, b) =>
        a.local_name.localeCompare(b.local_name) ||
        a.namespace.localeCompare(b.namespace) ||
        a.term_kind.localeCompare(b.term_kind),
    );
}

function CoverageDonut({
  label,
  total,
  missing,
}: {
  label: string;
  total: number;
  missing: number;
}) {
  const percent = coveragePercent(total, missing);
  const tone =
    missing === 0 ? 'text-emerald-700' : percent >= 70 ? 'text-amber-700' : 'text-rose-700';
  const ring = missing === 0 ? '#10b981' : percent >= 70 ? '#f59e0b' : '#f43f5e';

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-4">
        <div
          className="grid h-24 w-24 shrink-0 place-items-center rounded-full"
          style={{ background: `conic-gradient(${ring} ${percent}%, #e5e7eb 0)` }}
        >
          <div className="grid h-16 w-16 place-items-center rounded-full bg-white">
            <div className={`text-xl font-semibold ${tone}`}>{percent}%</div>
          </div>
        </div>
        <div>
          <div className="text-sm font-semibold text-gray-950">{label}</div>
          <div className="mt-1 text-xs text-gray-600">
            {Math.max(0, total - missing)} of {total || 0} matched
          </div>
          <div className="mt-2 text-xs text-gray-500">
            {missing === 0 ? 'All selected rule terms have matches.' : `${missing} need review.`}
          </div>
        </div>
      </div>
    </div>
  );
}

function InspectResponsePanel({
  view,
  rules,
  standards,
  profileId,
  candidateLimit,
  similarityThreshold,
}: {
  view: InspectView;
  rules: RuleRunnerItem[];
  standards: StandardSummary[];
  profileId: string | null;
  candidateLimit: number;
  similarityThreshold: number;
}) {
  const activeAction =
    createFromRulesInspectActions.find((action) => action.id === view) ||
    createFromRulesInspectActions[0];
  const ruleCount = rules.length;
  const ruleIds = useMemo(() => rules.map((rule) => rule.rule_id), [rules]);
  const [aggregateTerms, setAggregateTerms] = useState<RuleTermsAggregateResponse | null>(null);
  const [perRuleTerms, setPerRuleTerms] = useState<Record<string, RuleTermsResponse>>({});
  const [termsLoading, setTermsLoading] = useState(false);
  const [termsError, setTermsError] = useState<string | null>(null);
  const [expandedTermId, setExpandedTermId] = useState<string | null>(null);
  const [coverage, setCoverage] = useState<ProfileRulesCoverageResponse | null>(null);
  const [coverageLoading, setCoverageLoading] = useState(false);
  const [coverageError, setCoverageError] = useState<string | null>(null);
  const [coverageCandidates, setCoverageCandidates] = useState<CoverageCandidate[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [candidatesError, setCandidatesError] = useState<string | null>(null);
  const [ruleSupportAnalysed, setRuleSupportAnalysed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadRuleTerms() {
      if (ruleIds.length === 0) {
        setAggregateTerms(null);
        setPerRuleTerms({});
        setTermsError(null);
        return;
      }

      setTermsLoading(true);
      setTermsError(null);

      try {
        const individualResponses = await Promise.all(
          ruleIds.map(async (ruleId) => {
            const response = await fetch(
              `${env.apiBaseUrl}/rules/${encodeURIComponent(ruleId)}/terms`,
            );
            if (!response.ok) {
              throw new Error(`Rule terms failed for ${ruleId}: ${response.status}`);
            }
            return [ruleId, (await response.json()) as RuleTermsResponse] as const;
          }),
        );
        const perRuleMap = Object.fromEntries(individualResponses);
        let aggregate = synthesizeAggregateTerms(individualResponses.map(([, terms]) => terms));

        if (ruleIds.length > 1) {
          const aggregateResponse = await fetch(`${env.apiBaseUrl}/rules/terms/aggregate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rule_ids: ruleIds, compact_terms: false }),
          });

          if (aggregateResponse.ok) {
            aggregate = (await aggregateResponse.json()) as RuleTermsAggregateResponse;
          }
        }

        if (cancelled) return;

        setAggregateTerms(aggregate);
        setPerRuleTerms(perRuleMap);
      } catch (error) {
        if (cancelled) return;
        setAggregateTerms(null);
        setPerRuleTerms({});
        setTermsError(error instanceof Error ? error.message : 'Failed to load rule terms');
      } finally {
        if (!cancelled) {
          setTermsLoading(false);
        }
      }
    }

    void loadRuleTerms();

    return () => {
      cancelled = true;
    };
  }, [ruleIds]);

  const definitions = useMemo(
    () => buildDefinitionTerms(aggregateTerms, perRuleTerms),
    [aggregateTerms, perRuleTerms],
  );
  const definitionCount =
    definitions.length ||
    (aggregateTerms?.stats.unique_target_classes ?? 0) +
      (aggregateTerms?.stats.unique_property_paths ?? 0);
  const duplicateCount =
    (aggregateTerms?.stats.target_class_local_name_collisions ?? 0) +
    (aggregateTerms?.stats.property_path_local_name_collisions ?? 0);
  const ruleIndexById = useMemo(
    () => new Map(ruleIds.map((ruleId, index) => [ruleId, index])),
    [ruleIds],
  );
  const allRuleTerms = useMemo(
    () => [
      ...(aggregateTerms?.target_classes ?? []).map((term) => ({
        term: term.full_iri || term.value,
        kind: 'Class' as const,
      })),
      ...(aggregateTerms?.property_paths ?? []).map((term) => ({
        term: term.full_iri || term.value,
        kind: 'Property' as const,
      })),
    ],
    [aggregateTerms],
  );
  const exactCoveredTermKeys = useMemo(
    () =>
      new Set(
        coverageCandidates
          .filter((candidate) => candidate.exact)
          .map((candidate) => `${candidate.kind}:${sourceTermKey(candidate.missingTerm)}`),
      ),
    [coverageCandidates],
  );
  const missingProperties = useMemo(
    () =>
      uniqueValues(
        allRuleTerms
          .filter(
            (item) =>
              item.kind === 'Property' &&
              !exactCoveredTermKeys.has(`${item.kind}:${sourceTermKey(item.term)}`),
          )
          .map((item) => item.term),
      ),
    [allRuleTerms, exactCoveredTermKeys],
  );
  const missingTargetClasses = useMemo(
    () =>
      uniqueValues(
        allRuleTerms
          .filter(
            (item) =>
              item.kind === 'Class' &&
              !exactCoveredTermKeys.has(`${item.kind}:${sourceTermKey(item.term)}`),
          )
          .map((item) => item.term),
      ),
    [allRuleTerms, exactCoveredTermKeys],
  );
  const suggestedCoverageCandidates = useMemo(
    () =>
      coverageCandidates.filter(
        (candidate) =>
          !candidate.exact &&
          candidate.score !== null &&
          candidate.score >= similarityThreshold &&
          (missingTargetClasses.includes(candidate.missingTerm) ||
            missingProperties.includes(candidate.missingTerm)),
      ),
    [coverageCandidates, missingProperties, missingTargetClasses, similarityThreshold],
  );

  useEffect(() => {
    setCoverage(null);
    setCoverageCandidates([]);
    setCoverageError(null);
    setCandidatesError(null);
    setCoverageLoading(false);
    setCandidatesLoading(false);
    setRuleSupportAnalysed(false);
  }, [candidateLimit, profileId, ruleIds, standards]);

  const analyseRuleSupport = async () => {
    if (!profileId || ruleIds.length === 0 || coverageLoading || candidatesLoading) return;

    setRuleSupportAnalysed(true);
    setCoverageLoading(true);
    setCandidatesLoading(true);
    setCoverageError(null);
    setCandidatesError(null);

    try {
      const response = await fetch(
        `${env.apiBaseUrl}/lexicon/profiles/${encodeURIComponent(profileId)}/rules/coverage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rule_ids: ruleIds }),
        },
      );

      if (!response.ok) {
        throw new Error(`Rule support check failed: ${response.status}`);
      }

      setCoverage((await response.json()) as ProfileRulesCoverageResponse);
    } catch (error) {
      setCoverage(null);
      setCoverageError(error instanceof Error ? error.message : 'Rule support check failed');
    } finally {
      setCoverageLoading(false);
    }

    try {
      if (allRuleTerms.length === 0 || standards.length === 0) {
        setCoverageCandidates([]);
        return;
      }

      const results = await fetchRuleOntologyCandidates(
        ruleIds,
        allRuleTerms,
        standards,
        candidateLimit,
      );
      setCoverageCandidates(results);
    } catch (error) {
      setCoverageCandidates([]);
      setCandidatesError(
        error instanceof Error ? error.message : 'Candidate rule support analysis failed',
      );
    } finally {
      setCandidatesLoading(false);
    }
  };

  if (view === 'summary') {
    return (
      <div className="space-y-5">
        <div>
          <div className="rule-workspace-header">Profile summary</div>
          <p className="mt-2 text-sm text-gray-600">
            This profile draft combines {ruleCount} rules with {standards.length} standards. Open
            each group to inspect what the profile is made from before saving it.
          </p>
        </div>
        <div className="space-y-4">
          <div className="grid items-stretch gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
            <ProfileSummarySourceCard title="Rules" count={ruleCount} tone="rules">
              <div className="space-y-2">
                {rules.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-gray-200 p-3 text-sm text-gray-500">
                    No rules selected.
                  </div>
                ) : (
                  rules.slice(0, 4).map((rule, index) => (
                    <div key={rule.runner_item_id} className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${ruleColorClass(index)}`} />
                      <span className="truncate text-sm font-medium text-gray-900">
                        {rule.label}
                      </span>
                    </div>
                  ))
                )}
                {rules.length > 4 && (
                  <div className="text-xs text-gray-500">+ {rules.length - 4} more rules</div>
                )}
              </div>
            </ProfileSummarySourceCard>

            <div className="flex items-center justify-center">
              <div className="rounded-full border border-gray-200 bg-white p-2 text-gray-500 shadow-sm">
                <LinkIcon className="h-5 w-5" />
              </div>
            </div>

            <ProfileSummarySourceCard title="Standards" count={standards.length} tone="standards">
              <div className="space-y-2">
                {standards.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-gray-200 p-3 text-sm text-gray-500">
                    No standards selected.
                  </div>
                ) : (
                  standards.map((standard) => (
                    <div key={standard.id} className="rounded-lg bg-orange-50/70 p-2">
                      <div className="truncate text-sm font-semibold text-gray-950">
                        {standard.title || standardLabel(standard)}
                      </div>
                      <div className="mt-1 text-xs text-gray-600">
                        {standard.ontology_family}/{standard.country} - {standard.version}
                      </div>
                      <div className="mt-1 text-[11px] text-gray-500">
                        {standard.class_count} classes, {standard.property_count} properties,{' '}
                        {standard.property_set_count} sets
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ProfileSummarySourceCard>
          </div>

          <ProfileSummaryAccordion
            title="Definitions"
            count={definitionCount}
            tone="definitions"
            defaultOpen
          >
            {duplicateCount > 0 && (
              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Possible duplicate terms detected: {duplicateCount} local-name collisions. Terms
                with the same short name from different namespaces are highlighted below.
              </div>
            )}
            {termsLoading && (
              <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-500">
                Loading rule terms...
              </div>
            )}
            {termsError && (
              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                {termsError}
              </div>
            )}
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {definitions.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-200 p-3 text-sm text-gray-500">
                  Definitions will appear after rule term statistics are available.
                </div>
              ) : (
                definitions.map((definition) => (
                  <button
                    key={definition.id}
                    type="button"
                    onClick={() =>
                      setExpandedTermId((value) => (value === definition.id ? null : definition.id))
                    }
                    className={`w-full rounded-md border px-3 py-2 text-left ${
                      definition.duplicate
                        ? 'border-amber-200 bg-amber-50'
                        : 'border-gray-100 bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="flex shrink-0 -space-x-1">
                          {definition.rule_ids.map((ruleId) => (
                            <span
                              key={ruleId}
                              className={`h-2.5 w-2.5 rounded-full ring-1 ring-white ${ruleColorClass(
                                ruleIndexById.get(ruleId) ?? 0,
                              )}`}
                              title={rules.find((rule) => rule.rule_id === ruleId)?.label || ruleId}
                            />
                          ))}
                        </div>
                        <div className="truncate text-sm font-medium text-gray-900">
                          {definition.local_name}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-600 uppercase">
                          {definition.term_kind}
                        </span>
                        <span className="text-[11px] text-gray-500">
                          {shortNamespace(definition.namespace)}
                        </span>
                      </div>
                    </div>
                    {expandedTermId === definition.id && (
                      <div className="mt-2 rounded-md bg-white p-2 font-mono text-[11px] break-all text-gray-600">
                        {definition.full_iri}
                      </div>
                    )}
                  </button>
                ))
              )}
            </div>
            {aggregateTerms?.stats && (
              <div className="mt-3 grid gap-2 text-center text-[11px] text-gray-600 sm:grid-cols-4">
                <div className="rounded-md bg-gray-50 px-2 py-2">
                  <div className="font-semibold text-gray-950">
                    {aggregateTerms.stats.element_count}
                  </div>
                  <div>Elements</div>
                </div>
                <div className="rounded-md bg-gray-50 px-2 py-2">
                  <div className="font-semibold text-gray-950">
                    {aggregateTerms.stats.unique_target_classes}
                  </div>
                  <div>Classes</div>
                </div>
                <div className="rounded-md bg-gray-50 px-2 py-2">
                  <div className="font-semibold text-gray-950">
                    {aggregateTerms.stats.unique_property_paths}
                  </div>
                  <div>Properties</div>
                </div>
                <div className="rounded-md bg-gray-50 px-2 py-2">
                  <div className="font-semibold text-gray-950">
                    {aggregateTerms.stats.unique_target_property_pairs}
                  </div>
                  <div>Pairs</div>
                </div>
              </div>
            )}
          </ProfileSummaryAccordion>
        </div>
      </div>
    );
  }

  if (view === 'coverage') {
    const classTotal = Math.max(
      aggregateTerms?.stats.unique_target_classes ?? 0,
      missingTargetClasses.length,
    );
    const propertyTotal = Math.max(
      aggregateTerms?.stats.unique_property_paths ?? 0,
      missingProperties.length,
    );
    const missingRows = [
      ...missingTargetClasses.map((term) => ({ term, kind: 'Class' as const })),
      ...missingProperties.map((term) => ({ term, kind: 'Property' as const })),
    ];
    const compatibilityRows = suggestedCoverageCandidates.map((candidate) => {
      const ruleType = ruleKindToTermType(candidate.kind);
      const ontologyType = normalizeTermType(candidate.candidateKind);

      return {
        ...candidate,
        ruleType,
        ontologyType,
        compatible: termTypesAreCompatible(ruleType, ontologyType),
      };
    });
    const compatibleCount = compatibilityRows.filter((row) => row.compatible).length;
    const mismatchCount = compatibilityRows.length - compatibleCount;

    return (
      <div className="space-y-5">
        <div>
          <div className="rule-workspace-header">Rule support</div>
          <p className="mt-2 text-sm text-gray-600">
            Lexicon checks whether this saved draft can support the selected rules, then suggests
            standard terms for anything still missing.
          </p>
        </div>

        {!profileId && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
            Waiting for the silent draft save before rule support can be checked.
          </div>
        )}

        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="font-semibold text-gray-950">Analyse rule support</div>
              <p className="mt-1 max-w-2xl text-sm text-gray-600">
                This runs coverage and candidate matching against the selected standards. It can be
                heavier when IFC or many rules are selected, so Lexicon only runs it when you ask.
              </p>
            </div>
            <button
              type="button"
              onClick={analyseRuleSupport}
              disabled={!profileId || termsLoading || coverageLoading || candidatesLoading}
              className="inline-flex items-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
            >
              {(coverageLoading || candidatesLoading) && (
                <ArrowPathIcon className="h-4 w-4 animate-spin" />
              )}
              {coverageLoading || candidatesLoading ? 'Analysing...' : 'Analyse rule support'}
            </button>
          </div>
          {termsLoading && (
            <div className="mt-3 text-xs text-gray-500">
              Rule terms are still loading. The analysis button will unlock when they are ready.
            </div>
          )}
        </div>

        {!ruleSupportAnalysed && (
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">
            Rule support has not been analysed yet. Use the button above to run the check.
          </div>
        )}

        {ruleSupportAnalysed && (
          <>
            {coverageLoading && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                Checking rule support...
              </div>
            )}

            {coverageError && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                {coverageError}
              </div>
            )}

            {candidatesError && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                {candidatesError}
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <CoverageDonut
                label="Target classes"
                total={classTotal}
                missing={missingTargetClasses.length}
              />
              <CoverageDonut
                label="Properties"
                total={propertyTotal}
                missing={missingProperties.length}
              />
            </div>

            <div className="grid gap-2 text-center text-xs text-gray-600 md:grid-cols-4">
              {[
                ['Elements', aggregateTerms?.stats.element_count ?? 0],
                ['Classes', aggregateTerms?.stats.unique_target_classes ?? 0],
                ['Properties', aggregateTerms?.stats.unique_property_paths ?? 0],
                ['Pairs', aggregateTerms?.stats.unique_target_property_pairs ?? 0],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-gray-200 bg-white p-3">
                  <div className="text-lg font-semibold text-gray-950">{value}</div>
                  <div>{label}</div>
                </div>
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_1px_minmax(0,1.1fr)]">
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold text-gray-950">Missing in rules</div>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">
                    {missingRows.length}
                  </span>
                </div>
                <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
                  {missingRows.length === 0 ? (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                      No missing targets or properties returned by the coverage check.
                    </div>
                  ) : (
                    missingRows.map((item) => (
                      <div key={`${item.kind}-${item.term}`} className="rounded-lg bg-gray-50 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="truncate text-sm font-semibold text-gray-950">
                            {shortTermName(item.term)}
                          </div>
                          <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-600 uppercase">
                            {item.kind}
                          </span>
                        </div>
                        <div className="mt-1 truncate font-mono text-[11px] text-gray-500">
                          {item.term}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="hidden bg-gradient-to-b from-transparent via-gray-300 to-transparent lg:block" />

              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold text-gray-950">Potential matches</div>
                  <span className="rounded-full bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-800">
                    top {candidateLimit} / standard
                  </span>
                </div>
                <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
                  {candidatesLoading ? (
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
                      Asking Lexicon to compare rule terms with selected standards...
                    </div>
                  ) : suggestedCoverageCandidates.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-gray-200 p-3 text-sm text-gray-500">
                      Candidate matches will appear when selected standards have possible
                      alternatives for missing rule terms.
                    </div>
                  ) : (
                    suggestedCoverageCandidates.map((candidate) => (
                      <div
                        key={`${candidate.ruleId}-${candidate.missingTerm}-${candidate.standardId}-${candidate.termId}`}
                        className="rounded-lg border border-orange-100 bg-orange-50/50 p-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-gray-950">
                              {candidate.label}
                            </div>
                            <div className="mt-1 text-xs text-gray-600">
                              {candidate.standardLabel} for {shortTermName(candidate.missingTerm)}
                            </div>
                          </div>
                          <div className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-gray-700">
                            {candidate.score === null
                              ? 'search'
                              : `${Math.round(candidate.score * 100)}%`}
                          </div>
                        </div>
                        <div className="mt-2 truncate font-mono text-[11px] text-gray-500">
                          {candidate.uri}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                          <span className="rounded-full bg-white px-2 py-0.5 font-semibold text-gray-600">
                            rule {ruleKindToTermType(candidate.kind)}
                          </span>
                          <span className="text-gray-400">to</span>
                          <span className="rounded-full bg-white px-2 py-0.5 font-semibold text-gray-600">
                            standard {normalizeTermType(candidate.candidateKind)}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-gray-950">Type compatibility</div>
                  <p className="mt-1 text-sm text-gray-600">
                    Checks whether rule targets are matched to the same kind of standard term.
                    Allowed: class to class, property to property, set to set, class to subclass,
                    and subclass to class.
                  </p>
                </div>
                <div
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                    mismatchCount === 0
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-amber-200 bg-amber-50 text-amber-800'
                  }`}
                >
                  {compatibleCount}/{compatibilityRows.length || 0} compatible
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {compatibilityRows.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-gray-200 p-3 text-sm text-gray-500">
                    Type compatibility appears after candidate matches are available.
                  </div>
                ) : (
                  compatibilityRows.slice(0, 8).map((row) => (
                    <div
                      key={`${row.missingTerm}-${row.standardId}-${row.termId}-compatibility`}
                      className={`rounded-lg border p-3 ${
                        row.compatible
                          ? 'border-emerald-100 bg-emerald-50/70'
                          : 'border-amber-200 bg-amber-50'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-gray-950">
                            {shortTermName(row.missingTerm)} to {row.label}
                          </div>
                          <div className="mt-1 text-xs text-gray-600">{row.standardLabel}</div>
                        </div>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${
                            row.compatible
                              ? 'border-emerald-200 bg-white text-emerald-800'
                              : 'border-amber-300 bg-white text-amber-800'
                          }`}
                        >
                          {row.compatible ? 'OK' : 'Review'}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-600">
                        <span className="rounded-md bg-white px-2 py-1">rule {row.ruleType}</span>
                        <span>{'->'}</span>
                        <span className="rounded-md bg-white px-2 py-1">
                          standard {row.ontologyType}
                        </span>
                        {!row.compatible && (
                          <span className="text-amber-800">
                            Prefer matching class-class, property-property, or set-set.
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {compatibilityRows.length > 8 && (
                <div className="mt-3 text-xs text-gray-500">
                  Showing first 8 of {compatibilityRows.length} candidate type checks.
                </div>
              )}
            </div>

            {coverage && (
              <div className="grid gap-3 text-center text-xs text-gray-600 sm:grid-cols-3">
                <div className="rounded-lg bg-gray-50 p-3">
                  <div className="text-lg font-semibold text-gray-950">
                    {coverage.fully_supported_rule_ids?.length ?? 0}
                  </div>
                  <div>Fully supported</div>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <div className="text-lg font-semibold text-gray-950">
                    {coverage.partially_supported_rules?.length ?? 0}
                  </div>
                  <div>Need choices</div>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <div className="text-lg font-semibold text-gray-950">
                    {coverage.unsupported_rule_ids?.length ?? 0}
                  </div>
                  <div>Unsupported</div>
                </div>
              </div>
            )}
          </>
        )}
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

  if (view === 'save') {
    return (
      <div>
        <div className="rule-workspace-header">Save profile</div>
        <p className="mt-2 text-sm text-gray-600">
          Saving turns this draft into a reusable Lexicon profile with a profile id.
        </p>
        <button
          type="button"
          className="mt-4 rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700"
        >
          Save profile
        </button>
      </div>
    );
  }

  if (view === 'graphCoverage') {
    return (
      <div>
        <div className="rule-workspace-header">Compare with BIM graph</div>
        <p className="mt-2 text-sm text-gray-600">
          Choose a BIM representation to see which target classes and properties are covered by
          graph data.
        </p>
        <div className="mt-4 min-h-56 rounded-lg border border-dashed border-gray-300 bg-white p-4 text-sm text-gray-500">
          BIM graph selection is not connected in this flow yet.
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
  const setAvailableRules = useRuleBookStore((state: RuleBookStore) => state.setAvailableRules);
  const setRulesApiOnline = useRuleBookStore((state: RuleBookStore) => state.setRulesApiOnline);
  const setRulesLoading = useRuleBookStore((state: RuleBookStore) => state.setRulesLoading);
  const setRulesError = useRuleBookStore((state: RuleBookStore) => state.setRulesError);
  const removeRuleFromRunner = useRuleBookStore(
    (state: RuleBookStore) => state.removeRuleFromRunner,
  );
  const moveRunnerItem = useRuleBookStore((state: RuleBookStore) => state.moveRunnerItem);
  const setRunnerRuleItems = useRuleBookStore((state: RuleBookStore) => state.setRunnerRuleItems);
  const [mode, setMode] = useState<LexiconMode>('start');
  const [leftCollapsed, setLeftCollapsed] = useState(true);
  const [rightCollapsed, setRightCollapsed] = useState(true);
  const [drawerState, setDrawerState] = useState<DrawerState>('closed');
  const [activeProfileId, setActiveProfileId] = useState(profiles[0].id);
  const [rulePickerStarted, setRulePickerStarted] = useState(false);
  const [standardPickerStarted, setStandardPickerStarted] = useState(false);
  const [activeInspectView, setActiveInspectView] = useState<InspectView>('summary');
  const [touchedInspectActions, setTouchedInspectActions] = useState<Set<InspectView>>(new Set());
  const [availableStandards, setAvailableStandards] =
    useState<StandardSummary[]>(fallbackStandards);
  const [selectedStandards, setSelectedStandards] = useState<StandardSummary[]>([]);
  const [standardsLoading, setStandardsLoading] = useState(false);
  const [loadingStandardIds, setLoadingStandardIds] = useState<Set<string>>(new Set());
  const [standardsLoaded, setStandardsLoaded] = useState(false);
  const [standardsError, setStandardsError] = useState<string | null>(null);
  const [draftProfileId, setDraftProfileId] = useState<string | null>(null);
  const [profileName, setProfileName] = useState('');
  const [profileNameTouched, setProfileNameTouched] = useState(false);
  const [profileDescription, setProfileDescription] = useState('');
  const [profileKeywords, setProfileKeywords] = useState('rules, standards');
  const [canonicalStandardId, setCanonicalStandardId] = useState<string | null>(null);
  const [candidateLimit, setCandidateLimit] = useState(3);
  const [similarityThreshold, setSimilarityThreshold] = useState(0);
  const [autosaveState, setAutosaveState] = useState<ProfileAutosaveState>('idle');
  const [deriveState, setDeriveState] = useState<ProfileDeriveState>('idle');
  const [deriveError, setDeriveError] = useState<string | null>(null);
  const [derivedProfile, setDerivedProfile] = useState<DerivedProfileData | null>(null);
  const [lastAutosavedAt, setLastAutosavedAt] = useState<Date | null>(null);
  const [autosaveError, setAutosaveError] = useState<string | null>(null);
  const [autosaveMetrics, setAutosaveMetrics] = useState<ProfileAutosaveMetrics | null>(null);
  const workflowRestoredRef = useRef(false);
  const skipInitialWorkflowPersistRef = useRef(true);
  const draftProfileIdRef = useRef<string | null>(null);
  const autosaveInFlightRef = useRef(false);
  const autosaveQueuedRef = useRef(false);
  const allNodes = useMemo(() => flattenNodes(requirementTree), []);
  const [selectedNodeId] = useState(allNodes[2].id);
  const selectedNode = allNodes.find((node) => node.id === selectedNodeId) || allNodes[0];
  const activeStartOption = startOptions.find((option) => option.id === mode);
  const isWorkspace = mode === 'workspace' || mode === 'inspect';
  const canContinueWithDraft =
    mode === 'rules' && runnerRuleItems.length > 0 && selectedStandards.length > 0;
  const generatedProfileName = `Draft profile from ${runnerRuleItems.length || 1} ${
    runnerRuleItems.length === 1 ? 'rule' : 'rules'
  }`;
  const displayedProfileName =
    profileNameTouched && profileName.trim() ? profileName : generatedProfileName;
  const canonicalStandard =
    selectedStandards.find((standard) => standard.id === canonicalStandardId) ??
    selectedStandards[0] ??
    null;
  const ifcSelected = selectedStandards.some(
    (standard) => standard.ontology_family.toLowerCase() === 'ifc',
  );
  const activeInspectAction =
    createFromRulesInspectActions.find((action) => action.id === activeInspectView) ??
    createFromRulesInspectActions[0];

  const refreshStandardsLibrary = useCallback(async () => {
    setStandardsLoading(true);
    setStandardsError(null);

    try {
      const nextStandards = await listOntologyStandards();
      setAvailableStandards(nextStandards);
      setStandardsLoaded(true);
    } catch (error) {
      setStandardsError(
        error instanceof Error
          ? error.message
          : 'Could not load standards from the ontologies API.',
      );
      setAvailableStandards(fallbackStandards);
      setStandardsLoaded(true);
    } finally {
      setStandardsLoading(false);
    }
  }, []);

  const loadStandardsLibrary = useCallback(async () => {
    if (standardsLoading || standardsLoaded) return;
    await refreshStandardsLibrary();
  }, [refreshStandardsLibrary, standardsLoaded, standardsLoading]);

  const loadRulesLibrary = useCallback(async () => {
    if (availableRules.length > 0) return;

    setRulesLoading(true);
    setRulesError(null);

    try {
      const [health, apiRules] = await Promise.all([getRulesHealth(), listRules()]);
      setRulesApiOnline(Boolean(health.ok || health.status === 'ok'));
      setAvailableRules(apiRules);
    } catch (error) {
      setRulesApiOnline(false);
      setRulesError(error instanceof Error ? error.message : 'Failed to load rules');
      setAvailableRules([]);
    } finally {
      setRulesLoading(false);
    }
  }, [availableRules.length, setAvailableRules, setRulesApiOnline, setRulesError, setRulesLoading]);

  const loadFlowLibraries = useCallback(() => {
    void loadRulesLibrary();
    void loadStandardsLibrary();
  }, [loadRulesLibrary, loadStandardsLibrary]);

  useEffect(() => {
    draftProfileIdRef.current = draftProfileId;
  }, [draftProfileId]);

  const buildProfileRequestPayload = useCallback(
    (profileData: DerivedProfileData | null) => {
      const selectedOntologies = selectedStandards.map((standard) => ({
        ontology_family: standard.ontology_family,
        country: standard.country,
        version: standard.version,
      }));
      const canonicalOntology = canonicalStandard
        ? {
            ontology_family: canonicalStandard.ontology_family,
            country: canonicalStandard.country,
            version: canonicalStandard.version,
          }
        : selectedOntologies[0];

      return {
        name: displayedProfileName.trim() || generatedProfileName,
        description: profileDescription.trim() || null,
        keywords: profileKeywords
          .split(',')
          .map((keyword) => keyword.trim())
          .filter(Boolean),
        ontology_family:
          profileData?.ontology_family ?? canonicalOntology?.ontology_family ?? 'fbo',
        country: profileData?.country ?? canonicalOntology?.country ?? 'dk',
        version: profileData?.version ?? canonicalOntology?.version ?? 'latest',
        selected_ontologies: profileData?.selected_ontologies ?? selectedOntologies,
        canonical_target_ontology:
          profileData?.canonical_target_ontology ?? canonicalOntology ?? null,
        rule_ids: profileData?.rule_ids ?? runnerRuleItems.map((rule) => rule.rule_id),
        ...(profileData?.canonical_family_uri
          ? { canonical_family_uri: profileData.canonical_family_uri }
          : {}),
        ...(profileData?.canonical_country_uri
          ? { canonical_country_uri: profileData.canonical_country_uri }
          : {}),
        ...(profileData?.profile ? { profile: profileData.profile } : {}),
        ...(profileData?.rule_profiles ? { rule_profiles: profileData.rule_profiles } : {}),
      };
    },
    [
      canonicalStandard,
      displayedProfileName,
      generatedProfileName,
      profileDescription,
      profileKeywords,
      runnerRuleItems,
      selectedStandards,
    ],
  );

  const buildProfileCreatePayload = useCallback(() => {
    const selectedOntologies = selectedStandards.map((standard) => ({
      ontology_family: standard.ontology_family,
      country: standard.country,
      version: standard.version,
    }));
    const canonicalOntology = canonicalStandard
      ? {
          ontology_family: canonicalStandard.ontology_family,
          country: canonicalStandard.country,
          version: canonicalStandard.version,
        }
      : selectedOntologies[0];

    return {
      name: displayedProfileName.trim() || generatedProfileName,
      description: profileDescription.trim() || null,
      keywords: profileKeywords
        .split(',')
        .map((keyword) => keyword.trim())
        .filter(Boolean),
      ontology_family: canonicalOntology?.ontology_family ?? 'fbo',
      country: canonicalOntology?.country ?? 'dk',
      version: canonicalOntology?.version ?? 'latest',
      selected_ontologies: selectedOntologies,
      canonical_target_ontology: canonicalOntology ?? null,
      rule_ids: runnerRuleItems.map((rule) => rule.rule_id),
    };
  }, [
    canonicalStandard,
    displayedProfileName,
    generatedProfileName,
    profileDescription,
    profileKeywords,
    runnerRuleItems,
    selectedStandards,
  ]);

  useEffect(() => {
    if (workflowRestoredRef.current) return;

    const snapshot = readLexiconWorkflowSnapshot();

    if (snapshot) {
      setMode(snapshot.mode);
      setLeftCollapsed(snapshot.leftCollapsed);
      setRightCollapsed(snapshot.rightCollapsed);
      setDrawerState(snapshot.drawerState);
      setRulePickerStarted(snapshot.rulePickerStarted);
      setStandardPickerStarted(snapshot.standardPickerStarted);
      setActiveInspectView(snapshot.activeInspectView);
      setTouchedInspectActions(new Set(snapshot.touchedInspectActions));
      setSelectedStandards(snapshot.selectedStandards);
      setCanonicalStandardId(snapshot.canonicalStandardId);
      setDraftProfileId(snapshot.draftProfileId);
      setProfileName(snapshot.profileName);
      setProfileNameTouched(snapshot.profileNameTouched);
      setProfileDescription(snapshot.profileDescription);
      setProfileKeywords(snapshot.profileKeywords);
      setCandidateLimit(snapshot.candidateLimit);
      setSimilarityThreshold(snapshot.similarityThreshold);
      setDerivedProfile(snapshot.derivedProfile);
      setDeriveState(snapshot.derivedProfile || snapshot.draftProfileId ? 'derived' : 'idle');
      setRunnerRuleItems(snapshot.runnerRuleItems);

      if (snapshot.mode === 'rules' || snapshot.mode === 'inspect') {
        loadFlowLibraries();
      }
    }

    workflowRestoredRef.current = true;
  }, [loadFlowLibraries, setRunnerRuleItems]);

  useEffect(() => {
    if (!workflowRestoredRef.current) return;

    if (skipInitialWorkflowPersistRef.current) {
      skipInitialWorkflowPersistRef.current = false;
      return;
    }

    const canStayInInspect = runnerRuleItems.length > 0 && selectedStandards.length > 0;
    const checkpointMode = mode === 'inspect' && !canStayInInspect ? 'rules' : mode;

    writeLexiconWorkflowSnapshot({
      version: 1,
      updated_at: new Date().toISOString(),
      mode: checkpointMode,
      leftCollapsed,
      rightCollapsed,
      drawerState,
      rulePickerStarted,
      standardPickerStarted,
      activeInspectView,
      touchedInspectActions: Array.from(touchedInspectActions),
      selectedStandards,
      canonicalStandardId,
      draftProfileId,
      profileName,
      profileNameTouched,
      profileDescription,
      profileKeywords,
      candidateLimit,
      similarityThreshold,
      runnerRuleItems,
      derivedProfile,
    });
  }, [
    activeInspectView,
    candidateLimit,
    canonicalStandardId,
    draftProfileId,
    drawerState,
    derivedProfile,
    leftCollapsed,
    mode,
    profileDescription,
    profileKeywords,
    profileName,
    profileNameTouched,
    rightCollapsed,
    rulePickerStarted,
    runnerRuleItems,
    selectedStandards,
    similarityThreshold,
    standardPickerStarted,
    touchedInspectActions,
  ]);

  const replaceStandard = useCallback((loadedStandard: StandardSummary) => {
    const matchesStandard = (standard: StandardSummary) =>
      standard.ontology_family === loadedStandard.ontology_family &&
      standard.country === loadedStandard.country;

    setAvailableStandards((current) =>
      current.map((standard) => (matchesStandard(standard) ? loadedStandard : standard)),
    );
    setSelectedStandards((current) =>
      current.map((standard) => (matchesStandard(standard) ? loadedStandard : standard)),
    );
  }, []);

  const loadSingleStandard = useCallback(
    async (standard: StandardSummary) => {
      const source = ontologyStandardSources().find(
        (item) =>
          item.ontology_family === standard.ontology_family && item.country === standard.country,
      );

      if (!source || loadingStandardIds.has(standard.id)) return;

      setLoadingStandardIds((current) => {
        const next = new Set(current);
        next.add(standard.id);
        return next;
      });
      setStandardsError(null);

      try {
        const loadedStandard = await loadOntologyStandard(source, 20000);
        replaceStandard(loadedStandard);
      } catch (error) {
        setStandardsError(
          error instanceof Error
            ? error.message
            : `Could not load ${standard.ontology_family}/${standard.country}.`,
        );
      } finally {
        setLoadingStandardIds((current) => {
          const next = new Set(current);
          next.delete(standard.id);
          return next;
        });
      }
    },
    [loadingStandardIds, replaceStandard],
  );

  useEffect(() => {
    if (selectedStandards.length === 0) {
      setCanonicalStandardId(null);
      return;
    }

    setCanonicalStandardId((current) =>
      current && selectedStandards.some((standard) => standard.id === current)
        ? current
        : selectedStandards[0].id,
    );
  }, [selectedStandards]);

  const saveProfileDraft = useCallback(
    async (signal?: AbortSignal) => {
      if (
        !user ||
        mode !== 'inspect' ||
        !draftProfileIdRef.current ||
        !derivedProfile ||
        runnerRuleItems.length === 0 ||
        selectedStandards.length === 0
      ) {
        return;
      }

      if (autosaveInFlightRef.current) {
        autosaveQueuedRef.current = true;
        return;
      }

      autosaveInFlightRef.current = true;
      const activeDraftProfileId = draftProfileIdRef.current;
      const payload = buildProfileRequestPayload(derivedProfile);
      const requestBody = JSON.stringify(payload);
      const method = 'PUT';
      const endpoint = `/lexicon/profiles/${activeDraftProfileId}`;
      const requestStartedAt = performance.now();

      setAutosaveState('saving');
      setAutosaveError(null);

      try {
        const response = await fetch(
          `${env.apiBaseUrl}/lexicon/profiles/${encodeURIComponent(activeDraftProfileId)}`,
          {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: requestBody,
            signal,
          },
        );
        const durationMs = Math.round(performance.now() - requestStartedAt);

        setAutosaveMetrics({
          durationMs,
          payloadBytes: new Blob([requestBody]).size,
          status: response.status,
          method,
          endpoint,
          savedAt: new Date(),
        });

        if (!response.ok) {
          if (response.status === 401) {
            void signIn('authentik', {
              callbackUrl: window.location.pathname + window.location.search,
            });
            throw new Error('Sign in required to autosave this profile.');
          }

          throw new Error(`Profile autosave failed: ${response.status}`);
        }

        const data = (await response.json()) as {
          profile_record?: { id?: string };
        };
        const nextProfileId = data.profile_record?.id ?? activeDraftProfileId;

        const prunedProfiles = rememberRecentAutosaveProfile({
          id: nextProfileId,
          name: payload.name,
          saved_at: new Date().toISOString(),
        });

        if (prunedProfiles.length > 0) {
          void deleteAutosaveProfiles(prunedProfiles.map((profile) => profile.id));
        }

        if (data.profile_record?.id && data.profile_record.id !== activeDraftProfileId) {
          draftProfileIdRef.current = data.profile_record.id;
          setDraftProfileId(data.profile_record.id);
          rememberRecentAutosaveProfile({
            id: data.profile_record.id,
            name: payload.name,
            saved_at: new Date().toISOString(),
          });
        }

        setLastAutosavedAt(new Date());
        setAutosaveState('saved');
      } catch (error) {
        const durationMs = Math.round(performance.now() - requestStartedAt);

        if ((error as { name?: string }).name !== 'AbortError') {
          setAutosaveMetrics({
            durationMs,
            payloadBytes: new Blob([requestBody]).size,
            status: null,
            method,
            endpoint,
            savedAt: new Date(),
          });
        }

        if ((error as { name?: string }).name === 'AbortError') {
          return;
        }

        setAutosaveState('error');
        setAutosaveError(error instanceof Error ? error.message : 'Autosave failed');
      } finally {
        autosaveInFlightRef.current = false;

        if (autosaveQueuedRef.current) {
          autosaveQueuedRef.current = false;
          void saveProfileDraft();
        }
      }
    },
    [buildProfileRequestPayload, derivedProfile, mode, runnerRuleItems, selectedStandards, user],
  );

  useEffect(() => {
    if (
      !user ||
      mode !== 'inspect' ||
      !draftProfileId ||
      !derivedProfile ||
      runnerRuleItems.length === 0 ||
      selectedStandards.length === 0
    ) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void saveProfileDraft(controller.signal);
    }, 1200);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    canonicalStandard,
    displayedProfileName,
    derivedProfile,
    draftProfileId,
    generatedProfileName,
    mode,
    runnerRuleItems,
    saveProfileDraft,
    selectedStandards,
    user,
  ]);

  const deriveAndCreateProfile = async () => {
    if (!canContinueWithDraft || deriveState === 'deriving') return;

    setDeriveState('deriving');
    setDeriveError(null);
    setAutosaveError(null);
    setAutosaveState('idle');

    try {
      const createPayload = buildProfileCreatePayload();
      const createBody = JSON.stringify(createPayload);
      const createStartedAt = performance.now();
      const createResponse = await fetch(`${env.apiBaseUrl}/lexicon/profiles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: createBody,
      });

      setAutosaveMetrics({
        durationMs: Math.round(performance.now() - createStartedAt),
        payloadBytes: new Blob([createBody]).size,
        status: createResponse.status,
        method: 'POST',
        endpoint: '/lexicon/profiles',
        savedAt: new Date(),
      });

      if (!createResponse.ok) {
        let detail = '';

        try {
          const errorBody = (await createResponse.json()) as { detail?: unknown };
          detail =
            typeof errorBody.detail === 'string'
              ? `: ${errorBody.detail}`
              : errorBody.detail
                ? `: ${JSON.stringify(errorBody.detail)}`
                : '';
        } catch {
          detail = '';
        }

        if (createResponse.status === 401) {
          void signIn('authentik', {
            callbackUrl: window.location.pathname + window.location.search,
          });
          throw new Error('Sign in required to create this profile.');
        }

        throw new Error(`Profile create failed: ${createResponse.status}${detail}`);
      }

      const created = (await createResponse.json()) as {
        profile_record?: {
          id?: string;
          ontology_family?: string;
          country?: string;
          version?: string;
          selected_ontologies?: Array<Record<string, unknown>>;
          canonical_target_ontology?: Record<string, unknown> | null;
          rule_ids?: string[];
          profile?: Record<string, unknown>;
          rule_profiles?: Array<Record<string, unknown>>;
        };
        profile?: { id?: string } & Record<string, unknown>;
        id?: string;
      };
      const nextProfileId = created.profile_record?.id ?? created.profile?.id ?? created.id ?? null;

      if (!nextProfileId) {
        throw new Error('Profile was derived but no profile id was returned.');
      }

      const nextDerivedProfile: DerivedProfileData = {
        ontology_family: created.profile_record?.ontology_family ?? createPayload.ontology_family,
        country: created.profile_record?.country ?? createPayload.country,
        version: created.profile_record?.version ?? createPayload.version,
        selected_ontologies:
          created.profile_record?.selected_ontologies ?? createPayload.selected_ontologies,
        canonical_target_ontology:
          created.profile_record?.canonical_target_ontology ??
          createPayload.canonical_target_ontology,
        rule_ids: created.profile_record?.rule_ids ?? createPayload.rule_ids,
        profile: created.profile_record?.profile,
        rule_profiles: created.profile_record?.rule_profiles,
      };

      setDerivedProfile(nextDerivedProfile);
      draftProfileIdRef.current = nextProfileId;
      setDraftProfileId(nextProfileId);
      setLastAutosavedAt(new Date());
      setAutosaveState('saved');
      setDeriveState('derived');

      const prunedProfiles = rememberRecentAutosaveProfile({
        id: nextProfileId,
        name: createPayload.name,
        saved_at: new Date().toISOString(),
      });

      if (prunedProfiles.length > 0) {
        void deleteAutosaveProfiles(prunedProfiles.map((profile) => profile.id));
      }

      setMode('inspect');
      setLeftCollapsed(true);
      setRightCollapsed(true);
      setDrawerState('closed');
      setActiveInspectView('summary');
      setTouchedInspectActions(new Set(['summary']));
    } catch (error) {
      setDeriveState('error');
      setDeriveError(error instanceof Error ? error.message : 'Profile derivation failed');
      setAutosaveState('error');
      setAutosaveError(error instanceof Error ? error.message : 'Profile derivation failed');
    }
  };

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

    if (nextMode === 'rules') {
      loadFlowLibraries();
    }
  };

  const openWorkspace = () => {
    if (!canContinueWithDraft) return;
    void deriveAndCreateProfile();
  };

  const touchInspectAction = (view: InspectView) => {
    setActiveInspectView(view);
    setTouchedInspectActions((current) => {
      const next = new Set(current);
      next.add(view);
      return next;
    });
    void saveProfileDraft();
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
                            disabled={deriveState === 'deriving'}
                            className="inline-flex items-center gap-2 rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:cursor-wait disabled:bg-orange-300"
                          >
                            {deriveState === 'deriving' && (
                              <ArrowPathIcon className="h-4 w-4 animate-spin" />
                            )}
                            {deriveState === 'deriving' ? 'Deriving profile...' : 'Build profile'}
                          </button>
                        )}
                      </div>
                      {(deriveState === 'deriving' || deriveError || ifcSelected) && (
                        <div
                          className={`mx-6 mb-5 rounded-lg border px-4 py-3 text-sm ${
                            deriveError
                              ? 'border-amber-200 bg-amber-50 text-amber-900'
                              : 'border-orange-200 bg-orange-50 text-orange-950'
                          }`}
                        >
                          {deriveError
                            ? deriveError
                            : deriveState === 'deriving'
                              ? ifcSelected
                                ? 'Deriving profile. IFC is selected, so the first build can take longer while the standard is prepared.'
                                : 'Deriving profile from selected rules and standards.'
                              : 'IFC selected. First profile build may take longer while the standard is prepared.'}
                        </div>
                      )}

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
                                {(option.id === 'rules' || !option.available) && (
                                  <span
                                    className={[
                                      'rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase',
                                      option.id === 'rules'
                                        ? 'border-yellow-300 bg-yellow-100 text-yellow-800'
                                        : 'border-orange-300 bg-orange-100 text-orange-800',
                                    ].join(' ')}
                                  >
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
                  <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h1 className="text-2xl font-semibold text-gray-950">Inspect profile</h1>
                      <p className="mt-3 max-w-2xl text-sm text-gray-600">
                        Inspect the profile before saving. Lexicon silently keeps this draft updated
                        while you move through the actions.
                      </p>
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-right">
                      <div className="max-w-56 truncate text-sm font-semibold text-gray-950">
                        {displayedProfileName}
                      </div>
                      <div className="mt-1 flex items-center justify-end gap-2">
                        {autosaveState === 'saving' && (
                          <ArrowPathIcon className="h-3.5 w-3.5 animate-spin text-gray-500" />
                        )}
                        <div
                          className={`text-xs ${
                            autosaveState === 'error'
                              ? 'text-amber-700'
                              : autosaveState === 'saving'
                                ? 'text-gray-500'
                                : 'text-emerald-700'
                          }`}
                        >
                          {autosaveState === 'saving'
                            ? 'Autosaving...'
                            : autosaveState === 'error'
                              ? 'Autosave pending'
                              : lastAutosavedAt
                                ? `Autosaved ${lastAutosavedAt.toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}`
                                : 'Draft autosave ready'}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void saveProfileDraft()}
                        disabled={autosaveState === 'saving'}
                        className="mt-2 inline-flex items-center justify-center gap-1.5 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-wait disabled:opacity-60"
                      >
                        {autosaveState === 'saving' && (
                          <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />
                        )}
                        Save now
                      </button>
                      {autosaveMetrics && (
                        <div className="mt-2 font-mono text-[11px] text-gray-500">
                          {autosaveMetrics.durationMs} ms · {autosaveMetrics.payloadBytes} bytes ·
                          status {autosaveMetrics.status ?? 'network/aborted'}
                        </div>
                      )}
                    </div>
                  </div>
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
                      {createFromRulesInspectActions.map((action) => {
                        const active = activeInspectView === action.id;
                        const touched = touchedInspectActions.has(action.id);

                        return (
                          <button
                            key={action.id}
                            type="button"
                            onClick={() => touchInspectAction(action.id)}
                            className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                              active
                                ? 'border-gray-200 bg-white text-gray-900 shadow-md shadow-gray-200/80'
                                : touched
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
                                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="font-semibold">{action.label}</span>
                              {touched && (
                                <span
                                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${
                                    active
                                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                      : 'border-emerald-200 bg-white/80 text-emerald-800'
                                  }`}
                                >
                                  Touched
                                </span>
                              )}
                            </div>
                            <div
                              className={`mt-1 text-xs ${
                                active
                                  ? 'text-gray-500'
                                  : touched
                                    ? 'text-emerald-700'
                                    : 'text-gray-500'
                              }`}
                            >
                              {action.endpoint}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="p-5 pl-0 max-lg:pl-5">
                    <div className="min-h-full rounded-xl border border-gray-200 bg-white/95 p-5 shadow-sm">
                      <InspectResponsePanel
                        view={activeInspectView}
                        rules={runnerRuleItems}
                        standards={selectedStandards}
                        profileId={draftProfileId}
                        candidateLimit={candidateLimit}
                        similarityThreshold={similarityThreshold}
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
              loadingStandardIds={loadingStandardIds}
              error={standardsError}
              onLoadStandard={loadSingleStandard}
              onLibraryChanged={refreshStandardsLibrary}
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
                    <div className="rule-workspace-header">
                      {isWorkspace ? 'Expert' : 'Assistant'}
                    </div>
                    <p className="text-xs text-gray-500">
                      {isWorkspace ? 'Profile settings' : 'Recommended next steps'}
                    </p>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setRightCollapsed((value) => !value)}
                  className="rounded-md border border-gray-200 p-2 text-gray-600 hover:bg-gray-50"
                  title={
                    rightCollapsed
                      ? isWorkspace
                        ? 'Expand expert panel'
                        : 'Expand assistant'
                      : isWorkspace
                        ? 'Collapse expert panel'
                        : 'Collapse assistant'
                  }
                  aria-label={
                    rightCollapsed
                      ? isWorkspace
                        ? 'Expand expert panel'
                        : 'Expand assistant'
                      : isWorkspace
                        ? 'Collapse expert panel'
                        : 'Collapse assistant'
                  }
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
                  {isWorkspace ? (
                    <Bars3Icon className="h-5 w-5 text-gray-500" />
                  ) : (
                    <SparklesIcon className="h-5 w-5 text-gray-500" />
                  )}
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
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-gray-950">
                              Draft autosave
                            </div>
                            <p className="mt-1 text-xs text-gray-600">
                              Lexicon saves this draft silently while you inspect it.
                            </p>
                          </div>
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${
                              autosaveState === 'error'
                                ? 'border-amber-200 bg-amber-50 text-amber-800'
                                : autosaveState === 'saving'
                                  ? 'border-gray-200 bg-white text-gray-600'
                                  : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                            }`}
                          >
                            {autosaveState === 'saving'
                              ? 'Saving'
                              : autosaveState === 'error'
                                ? 'Pending'
                                : 'Saved'}
                            {autosaveState === 'saving' && (
                              <ArrowPathIcon className="h-3 w-3 animate-spin" />
                            )}
                          </span>
                        </div>
                        {draftProfileId && (
                          <div className="mt-2 truncate font-mono text-[11px] text-gray-500">
                            {draftProfileId}
                          </div>
                        )}
                        {autosaveMetrics && (
                          <div className="mt-3 rounded-md border border-gray-200 bg-white p-2 font-mono text-[11px] text-gray-600">
                            <div>
                              {autosaveMetrics.method} {autosaveMetrics.endpoint}
                            </div>
                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                              <span>{autosaveMetrics.durationMs} ms</span>
                              <span>{autosaveMetrics.payloadBytes} bytes</span>
                              <span>status {autosaveMetrics.status ?? 'network/aborted'}</span>
                            </div>
                          </div>
                        )}
                        {autosaveError && (
                          <div className="mt-2 text-xs text-amber-700">{autosaveError}</div>
                        )}
                        <button
                          type="button"
                          onClick={() => void saveProfileDraft()}
                          disabled={autosaveState === 'saving'}
                          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-wait disabled:opacity-60"
                        >
                          {autosaveState === 'saving' && (
                            <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />
                          )}
                          Save now
                        </button>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <label className="mb-1 block text-xs font-semibold tracking-wide text-gray-500 uppercase">
                            Profile name
                          </label>
                          <input
                            value={displayedProfileName}
                            onChange={(event) => {
                              setProfileNameTouched(true);
                              setProfileName(event.target.value);
                            }}
                            placeholder={generatedProfileName}
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-xs font-semibold tracking-wide text-gray-500 uppercase">
                            Description
                          </label>
                          <textarea
                            value={profileDescription}
                            onChange={(event) => setProfileDescription(event.target.value)}
                            rows={3}
                            className="w-full resize-none rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                            placeholder="Optional note for other Lexicon users"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-xs font-semibold tracking-wide text-gray-500 uppercase">
                            Keywords
                          </label>
                          <input
                            value={profileKeywords}
                            onChange={(event) => setProfileKeywords(event.target.value)}
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                            placeholder="rules, standards, fire"
                          />
                        </div>

                        <div className="rounded-lg border border-gray-200 p-3">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <div>
                              <div className="rule-workspace-header">Standards</div>
                              <p className="mt-1 text-xs text-gray-600">
                                Choose the main standard this draft should build toward.
                              </p>
                            </div>
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">
                              {selectedStandards.length}
                            </span>
                          </div>
                          <label className="mb-1 block text-xs font-semibold tracking-wide text-gray-500 uppercase">
                            Canonical standard
                          </label>
                          <select
                            value={canonicalStandardId ?? ''}
                            onChange={(event) => setCanonicalStandardId(event.target.value || null)}
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                          >
                            {selectedStandards.length === 0 && (
                              <option value="">No standard</option>
                            )}
                            {selectedStandards.map((standard) => (
                              <option key={standard.id} value={standard.id}>
                                {standard.title || standardLabel(standard)} ({standard.version})
                              </option>
                            ))}
                          </select>
                          <div className="mt-3 space-y-2">
                            {selectedStandards.map((standard) => (
                              <div
                                key={standard.id}
                                className="flex items-center justify-between gap-2 rounded-md bg-white px-2 py-1.5 text-xs"
                              >
                                <span className="truncate font-medium text-gray-800">
                                  {standard.title || standardLabel(standard)}
                                </span>
                                <span className="shrink-0 text-gray-500">{standard.version}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div>
                          <div className="rounded-lg border border-gray-200 p-3">
                            <div className="mb-3">
                              <div className="rule-workspace-header">Action settings</div>
                              <div className="mt-1 text-sm font-semibold text-gray-950">
                                {activeInspectAction.label}
                              </div>
                              <p className="mt-1 text-xs text-gray-600">
                                {activeInspectAction.description}
                              </p>
                            </div>

                            {activeInspectView === 'coverage' ? (
                              <div className="space-y-3">
                                <div>
                                  <label className="mb-1 block text-xs font-semibold text-gray-500">
                                    Candidates per standard
                                  </label>
                                  <input
                                    type="number"
                                    min={1}
                                    max={9}
                                    value={candidateLimit}
                                    onChange={(event) =>
                                      setCandidateLimit(
                                        Math.min(9, Math.max(1, Number(event.target.value) || 1)),
                                      )
                                    }
                                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                                  />
                                </div>
                                <div>
                                  <label className="mb-1 block text-xs font-semibold text-gray-500">
                                    Similarity threshold
                                  </label>
                                  <input
                                    type="number"
                                    min={0}
                                    max={1}
                                    step={0.01}
                                    value={similarityThreshold}
                                    onChange={(event) =>
                                      setSimilarityThreshold(
                                        Math.min(1, Math.max(0, Number(event.target.value) || 0)),
                                      )
                                    }
                                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                                  />
                                </div>
                                <p className="text-xs text-gray-600">
                                  Missing rule terms will be compared against each selected
                                  standard. With {selectedStandards.length || 1} standard
                                  {selectedStandards.length === 1 ? '' : 's'}, Lexicon can show up
                                  to {(selectedStandards.length || 1) * candidateLimit} candidates
                                  per missing term.
                                </p>
                              </div>
                            ) : activeInspectView === 'choices' ? (
                              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                                {[
                                  ['0', 'Accepted'],
                                  ['0', 'Ignored'],
                                  ['Pending', 'Open'],
                                ].map(([value, label]) => (
                                  <div key={label} className="rounded-md bg-gray-50 p-2">
                                    <div className="font-semibold text-gray-900">{value}</div>
                                    <div className="mt-1 text-gray-500">{label}</div>
                                  </div>
                                ))}
                              </div>
                            ) : activeInspectView === 'summary' ? (
                              <div className="space-y-2 text-xs text-gray-600">
                                <div className="flex justify-between">
                                  <span>Rules</span>
                                  <span className="font-semibold text-gray-900">
                                    {runnerRuleItems.length}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Standards</span>
                                  <span className="font-semibold text-gray-900">
                                    {selectedStandards.length}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Canonical</span>
                                  <span className="max-w-32 truncate font-semibold text-gray-900">
                                    {canonicalStandard
                                      ? canonicalStandard.title || standardLabel(canonicalStandard)
                                      : 'Not selected'}
                                  </span>
                                </div>
                              </div>
                            ) : activeInspectView === 'save' ? (
                              <div className="rounded-md bg-gray-50 p-3 font-mono text-[11px] text-gray-600">
                                {draftProfileId
                                  ? `PUT /lexicon/profiles/${draftProfileId}`
                                  : 'POST /lexicon/profiles'}
                              </div>
                            ) : (
                              <p className="text-xs text-gray-600">
                                This action will use the saved draft profile when graph selection
                                and profile choices are connected in the next pass.
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="rounded-lg border border-orange-100 bg-orange-50 p-3 text-xs text-orange-900">
                          The expert panel is optional. It is here for naming, tuning, and later
                          profile choice editing without interrupting the main flow.
                        </div>
                      </div>
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

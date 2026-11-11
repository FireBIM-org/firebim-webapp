export type TranslationJsonValue =
  | string
  | number
  | boolean
  | null
  | TranslationJsonValue[]
  | { [key: string]: TranslationJsonValue };

export interface TranslationOntologyPin {
  family: string;
  country: string;
  version: string;
  ontology_iri?: string | null;
  version_iri?: string | null;
  sha256?: string | null;
  artifact_ref?: string | null;
  dependencies: string[];
}

export interface TranslationDraftMapping {
  id: string;
  enabled: boolean;
  review_state: 'suggestion' | 'accepted' | 'rejected' | 'unresolved';
  seed_provenance?: Record<string, TranslationJsonValue> | null;
  definition: Record<string, TranslationJsonValue>;
}

export interface TranslationContract {
  kind: 'ifc_translation';
  contract_version: '1';
  source: {
    schema: 'IFC4';
    adapter: 'native_ifc';
    extraction_contract: 'native-ifc-record/1';
  };
  destination_release: '2026.09.04';
  destination_modules: TranslationOntologyPin[];
  mappings: TranslationDraftMapping[];
  optional_rule_ids: string[];
}

export interface TranslationProfileSummary {
  id: string;
  name: string;
  description?: string | null;
  kind: 'ifc_translation';
  status: 'draft' | 'archived';
  generation: number;
  updated_at: string;
}

export interface TranslationProfile extends TranslationProfileSummary {
  contract: TranslationContract;
  created_at: string;
  revision_refs: TranslationRevisionRef[];
}

export interface TranslationRevisionRef {
  revision_id: string;
  draft_generation: number;
  content_digest: string;
  published_at: string;
}

export interface TranslationPublishedRevision {
  revision_id: string;
  published_at: string;
  content_digest: string;
  content: {
    snapshot_version: '1';
    profile_id: string;
    draft_generation: number;
    name: string;
    description: string | null;
    source_contract: TranslationContract;
    contract: TranslationContract;
    compiled_mappings: Record<string, TranslationJsonValue>;
    ontology_artifacts: { pin: TranslationOntologyPin; ttl: string }[];
    diagnostics: TranslationValidationReport['diagnostics'];
    compiler_version: 'ifc4-module-compiler/1';
    source_schema_provenance: Record<string, TranslationJsonValue>;
  };
}

export interface TranslationMappingExtractionReport {
  profile_id: string;
  generation: number;
  mappings: TranslationDraftMapping[];
  skipped_existing: number;
  diagnostics: TranslationValidationReport['diagnostics'];
}

export interface TranslationValidationReport {
  profile_id: string;
  generation: number;
  authoring_valid: boolean;
  runtime_available: false;
  publish_ready: boolean;
  steps: {
    id: 'destination_ontologies' | 'mappings' | 'publication';
    status: 'passed' | 'failed' | 'unavailable';
    message: string;
  }[];
  diagnostics: {
    code: string;
    severity: 'error' | 'warning' | 'info';
    mapping_id: string | null;
    field_path: string;
    message: string;
  }[];
}

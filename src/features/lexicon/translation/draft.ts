import { z } from 'zod';

import type { TranslationContract, TranslationDraftMapping } from './types';

export type DraftEditor = {
  name: string;
  description: string;
  contract: TranslationContract;
  mappingsText: string;
};

const mappingSchema = z.strictObject({
  id: z.string().trim().min(1),
  enabled: z.boolean().default(false),
  review_state: z.enum(['suggestion', 'accepted', 'rejected', 'unresolved']).default('unresolved'),
  seed_provenance: z.record(z.string(), z.json()).nullable().optional(),
  definition: z.record(z.string(), z.json()).default({}),
});

export function emptyDraft(): DraftEditor {
  return {
    name: '',
    description: '',
    contract: {
      kind: 'ifc_translation',
      contract_version: '1',
      source: { schema: 'IFC4', adapter: 'native_ifc', extraction_contract: 'native-ifc-record/1' },
      destination_release: '2026.09.04',
      destination_modules: [],
      mappings: [],
      optional_rule_ids: [],
    },
    mappingsText: '[]',
  };
}

export function draftFromProfile(profile: {
  name: string;
  description?: string | null;
  contract: TranslationContract;
}): DraftEditor {
  return {
    name: profile.name,
    description: profile.description ?? '',
    contract: profile.contract,
    mappingsText: JSON.stringify(profile.contract.mappings, null, 2),
  };
}

export function parseDraftMappings(text: string): TranslationDraftMapping[] {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('Mappings must be valid JSON. Your text has not been changed.');
  }
  const parsed = z.array(mappingSchema).safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`Mapping ${issue.path.join('.') || 'list'}: ${issue.message}`);
  }
  const ids = parsed.data.map((mapping) => mapping.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error('Mapping IDs must be unique within a draft.');
  }
  return parsed.data;
}

export function draftPayload(draft: DraftEditor) {
  const name = draft.name.trim();
  if (!name || name.length > 200) {
    throw new Error('Enter a profile name between 1 and 200 characters.');
  }
  return {
    name,
    description: draft.description || null,
    contract: { ...draft.contract, mappings: parseDraftMappings(draft.mappingsText) },
  };
}

function checkpointKey(userId: string) {
  return `firebim-translation-draft-v1:${encodeURIComponent(userId)}`;
}

export function readCheckpoint(storage: Pick<Storage, 'getItem'>, userId: string): string | null {
  if (!userId) return null;
  try {
    const value = JSON.parse(storage.getItem(checkpointKey(userId)) ?? 'null');
    return value?.version === 1 &&
      typeof value.profile_id === 'string' &&
      value.profile_id.startsWith('ifct_')
      ? value.profile_id
      : null;
  } catch {
    return null;
  }
}

export function writeCheckpoint(
  storage: Pick<Storage, 'setItem' | 'removeItem'>,
  userId: string,
  profileId: string | null,
) {
  if (!userId) return;
  try {
    if (profileId) {
      storage.setItem(checkpointKey(userId), JSON.stringify({ version: 1, profile_id: profileId }));
    } else {
      storage.removeItem(checkpointKey(userId));
    }
  } catch {
    // Server persistence does not depend on browser storage being available.
  }
}

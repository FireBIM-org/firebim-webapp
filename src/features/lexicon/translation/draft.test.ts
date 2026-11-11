import { describe, expect, it } from 'vitest';

import {
  emptyDraft,
  draftFromProfile,
  draftPayload,
  readCheckpoint,
  writeCheckpoint,
} from './draft';

describe('translation draft editing', () => {
  it('creates an incomplete draft without rules or destination modules', () => {
    const draft = { ...emptyDraft(), name: '  IFC4 pilot  ' };
    const payload = draftPayload(draft);
    expect(payload.name).toBe('IFC4 pilot');
    expect(payload.description).toBeNull();
    expect(payload.contract.source.schema).toBe('IFC4');
    expect(payload.contract.destination_release).toBe('2026.09.04');
    expect(payload.contract.destination_modules).toEqual([]);
    expect(payload.contract.mappings).toEqual([]);
    expect(payload.contract.optional_rule_ids).toEqual([]);
  });

  it('round trips a server draft without discarding pins, provenance, or raw fire ratings', () => {
    const contract = {
      ...emptyDraft().contract,
      optional_rule_ids: ['optional-rule'],
      destination_modules: [
        {
          family: 'fbo',
          country: 'core',
          version: '2026.09.04',
          sha256: 'retained-digest',
          artifact_ref: 'retained-artifact',
          dependencies: ['fbo/units'],
        },
      ],
      mappings: [
        {
          id: 'fire-rating',
          enabled: false,
          review_state: 'unresolved' as const,
          definition: { value: 'REI60', incomplete: {} },
          seed_provenance: { source: 'seed' },
        },
      ],
    };
    const draft = draftFromProfile({ name: 'Pilot', description: 'Notes', contract });
    expect(draftPayload(draft)).toEqual({ name: 'Pilot', description: 'Notes', contract });
  });

  it('permits incomplete opaque definitions without claiming semantic validity', () => {
    const draft = {
      ...emptyDraft(),
      name: 'Pilot',
      mappingsText: '[{"id":"wall","definition":{}}]',
    };
    expect(draftPayload(draft).contract.mappings[0]).toMatchObject({
      id: 'wall',
      enabled: false,
      review_state: 'unresolved',
      definition: {},
    });
  });

  it.each(['', ' '.repeat(3), 'a'.repeat(201)])('rejects invalid profile name %j', (name) => {
    expect(() => draftPayload({ ...emptyDraft(), name })).toThrow(/name/i);
  });

  it.each([
    'not json',
    '{}',
    '[null]',
    '[{"id":" "}]',
    '[{"id":"wall","enabled":"false"}]',
    '[{"id":"wall","definition":[]}]',
    '[{"id":"wall","review_state":"approved"}]',
    '[{"id":"wall","typo":true}]',
    '[{"id":"wall"},{"id":"wall"}]',
  ])('rejects invalid mapping envelopes without silently discarding fields: %s', (mappingsText) => {
    expect(() => draftPayload({ ...emptyDraft(), name: 'Pilot', mappingsText })).toThrow(
      /mapping/i,
    );
  });
});

describe('user-scoped translation checkpoints', () => {
  function storage() {
    const values = new Map<string, string>();
    return {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
      removeItem: (key: string) => {
        values.delete(key);
      },
    };
  }

  it('stores only a versioned server record pointer and isolates users', () => {
    const store = storage();
    writeCheckpoint(store, 'alice', 'ifct_pilot');
    expect(readCheckpoint(store, 'alice')).toBe('ifct_pilot');
    expect(readCheckpoint(store, 'bob')).toBeNull();
    writeCheckpoint(store, 'alice', null);
    expect(readCheckpoint(store, 'alice')).toBeNull();
  });

  it('ignores stale checkpoint formats, foreign record kinds and blocked browser storage', () => {
    for (const value of [
      'broken',
      '{"version":0,"profile_id":"ifct_pilot"}',
      '{"version":1,"profile_id":"legacy"}',
    ]) {
      expect(readCheckpoint({ getItem: () => value }, 'alice')).toBeNull();
    }
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readCheckpoint(blocked, 'alice')).toBeNull();
    expect(() => writeCheckpoint(blocked, 'alice', 'ifct_pilot')).not.toThrow();
    expect(() => writeCheckpoint(blocked, 'alice', null)).not.toThrow();
    expect(readCheckpoint(storage(), '')).toBeNull();
  });
});

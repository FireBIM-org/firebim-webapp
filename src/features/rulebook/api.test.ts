import { describe, expect, it, vi } from 'vitest';

import type { BuildingGraphData } from './types';

vi.mock('@/config/env', () => ({ env: { apiBaseUrl: '/api/proxy' } }));

import { parseBuildingGraphTtl } from './api';

const ontology_catalog = {} as BuildingGraphData['ontology_catalog'];

function parse(ttl: string) {
  return parseBuildingGraphTtl(
    { graph_id: 'test', graph_uri: 'https://example.org/test', ttl },
    ontology_catalog,
  );
}

describe('parseBuildingGraphTtl', () => {
  it.each([
    'ex:building a bot:Building . ex:building bot:hasStorey ex:storey . ex:storey a bot:Storey .',
    'ex:building a bot:Building ; bot:hasStorey ex:storey . ex:storey a bot:Storey .',
  ])('reads separate triples and semicolon groups: %s', (ttl) => {
    const graph = parse(ttl);

    expect(graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'building', kind: 'Building' }),
        expect.objectContaining({ id: 'storey', kind: 'Storey' }),
      ]),
    );
    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toEqual([
      {
        id: 'building-hasStorey-storey',
        source: 'building',
        target: 'storey',
        relation: 'hasStorey',
      },
    ]);
  });

  it('keeps full IRIs and quoted punctuation intact and expands Turtle prefixes', () => {
    const graph = parse(`
      @prefix bot: <https://w3id.org/bot#> .
      @prefix ex: <https://example.org/> .
      # A comment must not become a subject.
      <https://example.org/building.1> a <https://w3id.org/bot#Building> ;
        ex:note "A. B; C, D # not a comment" ; ex:height 12.5 .
      <https://example.org/building.1> bot:hasStorey <https://example.org/storey.1> .
      <https://example.org/storey.1> a bot:Storey . # trailing comment
    `);

    expect(graph.nodes).toHaveLength(2);
    expect(graph.nodes).toContainEqual(
      expect.objectContaining({
        id: 'building.1',
        kind: 'Building',
        metadata: {
          'https://example.org/note': 'A. B; C, D # not a comment',
          'https://example.org/height': 12.5,
        },
      }),
    );
    expect(graph.edges).toContainEqual(
      expect.objectContaining({ source: 'building.1', target: 'storey.1', relation: 'hasStorey' }),
    );
  });

  it('handles comma lists, repeated types, and properties preceding types', () => {
    const graph = parse(`
      PREFIX ex: <https://example.org/>
      ex:wall ex:height 3 ; ex:adjacentTo ex:room1, ex:room2 ; .
      ex:wall a ex:Boundary, ex:Wall .
      ex:wall a ex:Element .
      ex:wall ex:width 2 .
    `);

    expect(graph.nodes).toHaveLength(3);
    expect(graph.nodes).toContainEqual(
      expect.objectContaining({
        id: 'wall',
        kind: 'Wall',
        metadata: { 'https://example.org/height': 3, 'https://example.org/width': 2 },
      }),
    );
    expect(graph.edges.map((edge) => edge.target)).toEqual(['room1', 'room2']);
  });

  it('recognizes rdf:type without adding type edges', () => {
    const graph = parse(`
      @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
      ex:wall rdf:type ex:Wall .
    `);

    expect(graph.nodes).toEqual([expect.objectContaining({ id: 'wall', kind: 'Wall' })]);
    expect(graph.edges).toEqual([]);
  });

  it('accepts an empty ready Neo preview and retains qualification metadata', () => {
    const graph = parseBuildingGraphTtl(
      {
        graph_id: 'neo_ready',
        graph_uri: 'https://example.org/neo_ready',
        backend: 'neo',
        immutable: true,
        nodes: [],
        edges: [],
        ttl: '',
        total_triples: 0,
        total_nodes: 0,
        total_edges: 0,
        preview_triples: 0,
        truncated: false,
      },
      ontology_catalog,
    );
    expect(graph.nodes).toEqual([]);
    expect(graph.backend).toBe('neo');
    expect(graph.immutable).toBe(true);
    expect(graph.triple_count).toBe(0);
  });

  it('uses full preview IRIs and full totals without reconstructing the qualified check dataset', () => {
    const graph = parseBuildingGraphTtl(
      {
        graph_id: 'neo_ready',
        graph_uri: 'https://example.org/neo_ready',
        backend: 'neo',
        immutable: true,
        nodes: [
          { id: 'https://one.example/wall', kind: 'Resource' },
          { id: 'https://two.example/wall', kind: 'Resource' },
        ],
        edges: [],
        ttl: '',
        total_triples: 1200,
        total_nodes: 900,
        total_edges: 1200,
        preview_triples: 1,
        truncated: true,
      },
      ontology_catalog,
    );
    expect(graph.nodes.map((node) => node.id)).toEqual([
      'https://one.example/wall',
      'https://two.example/wall',
    ]);
    expect(graph.triple_count).toBe(1200);
    expect(graph.preview_triples).toBe(1);
    expect(graph.truncated).toBe(true);
  });
});

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ModelDetail from '../pages/ifc-models/[id]';
import { IFCModel } from './api-client';

const { model } = vi.hoisted(() => ({
  model: {
    id: 'model-123',
    filename: 'building.ifc',
    created_at: '2026-10-22T12:00:00Z',
    user_id: 'user-123',
  } as IFCModel,
}));

vi.mock('next/router', () => ({ useRouter: () => ({ query: { id: 'model-123' } }) }));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: model }) }));
vi.mock('../hooks/useRequireAuth', () => ({
  useRequireAuth: () => ({ user: { id: 'user-123' } }),
}));
vi.mock('../components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('../components/IFCViewer', () => ({ default: () => null }));
vi.mock('../components/ModelAnalysisTable', () => ({ default: () => null }));

function renderModel(metadata: Partial<IFCModel>) {
  Object.assign(model, metadata);
  vi.stubGlobal('React', React);
  return renderToStaticMarkup(React.createElement(ModelDetail));
}

afterEach(() => {
  delete model.node_count;
  delete model.edge_count;
  delete model.conversion_profile_id;
  delete model.conversion_profile_name;
  vi.unstubAllGlobals();
});

describe('Model Information', () => {
  it('renders graph totals and the conversion profile name', () => {
    const html = renderModel({
      node_count: 12345,
      edge_count: 12344,
      conversion_profile_id: 'fire-safety',
      conversion_profile_name: 'Fire Safety',
    });

    expect(html).toContain(
      `Node Count</dt><dd class="mt-1 text-sm text-gray-900">${(12345).toLocaleString()}</dd>`,
    );
    expect(html).toContain(
      `Edge Count</dt><dd class="mt-1 text-sm text-gray-900">${(12344).toLocaleString()}</dd>`,
    );
    expect(html).toContain(
      'Conversion Profile</dt><dd class="mt-1 text-sm text-gray-900">Fire Safety</dd>',
    );
  });

  it('renders zero totals and falls back to the profile ID', () => {
    const html = renderModel({
      node_count: 0,
      edge_count: 0,
      conversion_profile_id: 'profile-123',
    });

    expect(html).toContain('Node Count</dt><dd class="mt-1 text-sm text-gray-900">0</dd>');
    expect(html).toContain('Edge Count</dt><dd class="mt-1 text-sm text-gray-900">0</dd>');
    expect(html).toContain(
      'Conversion Profile</dt><dd class="mt-1 text-sm text-gray-900">profile-123</dd>',
    );
  });

  it('shows Unknown when metadata is unavailable', () => {
    const html = renderModel({ node_count: null, edge_count: null });

    for (const label of ['Node Count', 'Edge Count', 'Conversion Profile']) {
      expect(html).toContain(`${label}</dt><dd class="mt-1 text-sm text-gray-900">Unknown</dd>`);
    }
  });
});

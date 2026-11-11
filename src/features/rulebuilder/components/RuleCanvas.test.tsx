// @vitest-environment happy-dom
import type { ReactFlowInstance, ReactFlowProps } from '@xyflow/react';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React, { useEffect } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import RuleCanvas from './RuleCanvas';

vi.mock('@xyflow/react/dist/style.css', () => ({}));

// Keep the canvas state and drop handler real; replace only the graph renderer.
vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@xyflow/react')>();
  const instance = {
    screenToFlowPosition: (position: { x: number; y: number }) => position,
  } as ReactFlowInstance;

  return {
    ...actual,
    ReactFlow: ({ onInit, nodes }: ReactFlowProps) => {
      useEffect(() => {
        onInit?.(instance);
      }, [onInit]);

      return (
        <div>
          {nodes?.map((node) => (
            <output key={node.id} data-testid="canvas-node">
              {JSON.stringify(node)}
            </output>
          ))}
        </div>
      );
    },
  };
});

beforeEach(() => {
  vi.stubGlobal('React', React);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('creates unique node IDs for drops and duplicates when crypto.randomUUID is unavailable', async () => {
  let randomValue = 0;
  vi.stubGlobal('crypto', {
    getRandomValues: (bytes: Uint8Array) => bytes.fill(++randomValue),
  });
  const onSelectedNodeChange = vi.fn();
  const { container, rerender } = render(
    <RuleCanvas
      selectedNodeId={null}
      onSelectedNodeChange={onSelectedNodeChange}
      editedRule={null}
      duplicateRequest={null}
      deleteRequest={null}
      deriveRequest={null}
    />,
  );

  const dropRule = () =>
    fireEvent.drop(container.firstElementChild!, {
      clientX: 120,
      clientY: 80,
      dataTransfer: {
        getData: (type: string) =>
          type === 'application/firebim-rule-node'
            ? JSON.stringify({
                kind: 'rule-node-template',
                nodeType: 'decision',
                label: 'Decision',
                template: { id: 'template', element_type: 'decision' },
                source: 'local',
              })
            : '',
      },
    });

  dropRule();
  await waitFor(() => expect(onSelectedNodeChange).toHaveBeenCalledTimes(1));
  const [sourceNodeId] = onSelectedNodeChange.mock.calls[0];

  dropRule();
  await waitFor(() => expect(onSelectedNodeChange).toHaveBeenCalledTimes(2));

  rerender(
    <RuleCanvas
      selectedNodeId={null}
      onSelectedNodeChange={onSelectedNodeChange}
      editedRule={null}
      duplicateRequest={{ requestId: 1, sourceNodeId }}
      deleteRequest={null}
      deriveRequest={null}
    />,
  );

  await waitFor(() => expect(onSelectedNodeChange).toHaveBeenCalledTimes(3));
  const nodes = screen.getAllByTestId('canvas-node').map((node) => JSON.parse(node.textContent!));
  const nodeIds = nodes.map((node) => node.id);

  expect(new Set(nodeIds).size).toBe(3);
  for (const node of nodes) {
    expect(node.id).toMatch(
      /^decision-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(node.data.rule.id).toBe(node.id);
  }
});

it('uses crypto.randomUUID when available', async () => {
  const randomUUID = vi.fn(() => 'native-uuid');
  vi.stubGlobal('crypto', { randomUUID });
  const onSelectedNodeChange = vi.fn();
  const { container } = render(
    <RuleCanvas
      selectedNodeId={null}
      onSelectedNodeChange={onSelectedNodeChange}
      editedRule={null}
      duplicateRequest={null}
      deleteRequest={null}
      deriveRequest={null}
    />,
  );

  fireEvent.drop(container.firstElementChild!, {
    clientX: 120,
    clientY: 80,
    dataTransfer: {
      getData: (type: string) =>
        type === 'application/firebim-rule-node'
          ? JSON.stringify({
              kind: 'rule-node-template',
              nodeType: 'decision',
              label: 'Decision',
              template: { id: 'template', element_type: 'decision' },
              source: 'local',
            })
          : '',
    },
  });

  await waitFor(() => expect(onSelectedNodeChange).toHaveBeenCalledOnce());
  expect(onSelectedNodeChange.mock.calls[0][0]).toBe('decision-native-uuid');
  expect(randomUUID).toHaveBeenCalledOnce();
});

// @vitest-environment happy-dom
import { cleanup, fireEvent, render } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { BuildingGraphData } from '../types';

import { useRuleBookStore } from '../store';
import { BuildingGraphView } from './BuildingGraphView';

const graph: BuildingGraphData = {
  id: 'interaction-test',
  label: 'Interaction test graph',
  nodes: [
    { id: 'building-1', kind: 'Building', label: 'Test building' },
    {
      id: 'wall-1',
      kind: 'Wall',
      label: 'Test wall',
      metadata: {
        'Long property': 'A full metadata value longer than twenty characters',
        'Short property': 'short',
        'Numeric property': 42,
        'Boolean property': false,
      },
    },
  ],
  edges: [],
  ontology_catalog: {},
};

function renderGraph() {
  return render(<BuildingGraphView />);
}

function getViewport(container: HTMLElement) {
  const viewport = container.querySelector<HTMLDivElement>('.cursor-grab');
  if (!viewport) throw new Error('Graph viewport not found');
  return viewport;
}

function getNode(container: HTMLElement, kind: string) {
  const text = Array.from(container.querySelectorAll('svg text')).find(
    (element) => element.textContent === kind,
  );
  const node = text?.closest('g[transform^="translate"]');
  if (!node) throw new Error(`Graph node ${kind} not found`);
  return node;
}

function clickCanvas(viewport: HTMLDivElement, x = 10, y = 10) {
  fireEvent.mouseDown(viewport, { button: 0, clientX: x, clientY: y });
  fireEvent.mouseUp(viewport, { button: 0, clientX: x, clientY: y });
  fireEvent.click(viewport, { clientX: x, clientY: y });
}

function clickNode(container: HTMLElement, kind: string) {
  const nodeText = Array.from(container.querySelectorAll('svg text')).find(
    (element) => element.textContent === kind,
  );
  if (!nodeText) throw new Error(`Graph node ${kind} not found`);
  fireEvent.mouseDown(nodeText, { button: 0, clientX: 10, clientY: 10 });
  fireEvent.mouseUp(nodeText, { button: 0, clientX: 10, clientY: 10 });
  fireEvent.click(nodeText, { clientX: 10, clientY: 10 });
}

function getMetadataBubble(container: HTMLElement, label: string) {
  const title = Array.from(container.querySelectorAll('svg title')).find((element) =>
    element.textContent?.startsWith(`${label}: `),
  );
  const bubble = title?.closest('g');
  if (!bubble) throw new Error(`Metadata bubble ${label} not found`);
  return bubble;
}

function getHoverDetails(container: HTMLElement) {
  return container.querySelector<HTMLElement>('[aria-label="Graph hover details"]');
}

beforeEach(() => {
  useRuleBookStore.getState().setActiveGraphData(graph);
  useRuleBookStore.getState().setGraphLoaded(true);
});

afterEach(() => {
  cleanup();
  useRuleBookStore.getState().setActiveGraphData(null);
  useRuleBookStore.getState().setGraphLoaded(false);
});

describe('BuildingGraphView canvas navigation', () => {
  it('pans the canvas without clearing the selected node', () => {
    const { container } = renderGraph();
    const viewport = getViewport(container);
    clickNode(container, 'Wall');

    fireEvent.mouseDown(viewport, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.mouseMove(viewport, { clientX: 30, clientY: 25 });
    fireEvent.mouseUp(viewport, { button: 0, clientX: 30, clientY: 25 });
    fireEvent.click(viewport, { clientX: 30, clientY: 25 });

    expect(getNode(container, 'Wall').getAttribute('opacity')).toBe('1');
    expect(container.querySelector('svg g[transform]')?.getAttribute('transform')).toContain(
      'translate(20 15)',
    );
  });

  it('deselects on a blank-canvas click', () => {
    const { container } = renderGraph();
    const viewport = getViewport(container);
    clickNode(container, 'Wall');
    expect(getNode(container, 'Wall').getAttribute('opacity')).toBe('1');

    clickCanvas(viewport);

    expect(getNode(container, 'Wall').getAttribute('opacity')).toBe('0.2');
  });

  it('treats sub-threshold movement as a click rather than a pan', () => {
    const { container } = renderGraph();
    const viewport = getViewport(container);
    clickNode(container, 'Wall');

    fireEvent.mouseDown(viewport, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.mouseMove(viewport, { clientX: 12, clientY: 12 });
    fireEvent.mouseUp(viewport, { button: 0, clientX: 12, clientY: 12 });
    fireEvent.click(viewport, { clientX: 12, clientY: 12 });

    expect(getNode(container, 'Wall').getAttribute('opacity')).toBe('0.2');
    expect(container.querySelector('svg g[transform]')?.getAttribute('transform')).toContain(
      'translate(0 0)',
    );
  });

  it('suppresses the click after a drag, then allows a later genuine node click', () => {
    const { container } = renderGraph();
    const viewport = getViewport(container);
    clickNode(container, 'Wall');

    fireEvent.mouseDown(viewport, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.mouseMove(viewport, { clientX: 30, clientY: 10 });
    fireEvent.mouseUp(viewport, { button: 0, clientX: 30, clientY: 10 });
    fireEvent.click(getNode(container, 'Building'), { clientX: 30, clientY: 10 });

    expect(getNode(container, 'Wall').getAttribute('opacity')).toBe('1');
    expect(getNode(container, 'Building').getAttribute('opacity')).toBe('0.2');

    clickNode(container, 'Building');

    expect(getNode(container, 'Wall').getAttribute('opacity')).toBe('0.2');
    expect(getNode(container, 'Building').getAttribute('opacity')).toBe('1');
  });

  it('keeps a gesture classified as a drag after returning to its origin', () => {
    const { container } = renderGraph();
    const viewport = getViewport(container);
    clickNode(container, 'Wall');

    fireEvent.mouseDown(viewport, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.mouseMove(viewport, { clientX: 20, clientY: 10 });
    fireEvent.mouseMove(viewport, { clientX: 10, clientY: 10 });
    fireEvent.mouseUp(viewport, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.click(viewport, { clientX: 10, clientY: 10 });

    expect(getNode(container, 'Wall').getAttribute('opacity')).toBe('1');
  });

  it('clears selection on Escape only while the canvas is focused', () => {
    const { container } = renderGraph();
    const viewport = getViewport(container);
    clickNode(container, 'Wall');
    const statusButton = container.querySelector('button');
    if (!statusButton) throw new Error('Canvas status button not found');
    statusButton.focus();
    fireEvent.keyDown(statusButton, { key: 'Escape' });
    expect(getNode(container, 'Wall').getAttribute('opacity')).toBe('1');

    viewport.focus();
    fireEvent.keyDown(viewport, { key: 'Escape' });

    expect(getNode(container, 'Wall').getAttribute('opacity')).toBe('0.2');
  });

  it('deselects when the selected node is clicked again', () => {
    const { container } = renderGraph();
    clickNode(container, 'Wall');
    expect(getNode(container, 'Wall').getAttribute('opacity')).toBe('1');

    clickNode(container, 'Wall');

    expect(getNode(container, 'Wall').getAttribute('opacity')).toBe('0.2');
  });

  it('shows full property labels and values in metadata bubble titles', () => {
    const { container } = renderGraph();
    clickNode(container, 'Wall');

    const longTitle = Array.from(container.querySelectorAll('svg title')).find(
      (title) =>
        title.textContent === 'Long property: A full metadata value longer than twenty characters',
    );
    expect(longTitle).toBeTruthy();
    expect(longTitle?.closest('g')?.querySelectorAll('text')[1]?.textContent).toBe(
      'A full metadata valu...',
    );

    expect(
      Array.from(container.querySelectorAll('svg title')).map((title) => title.textContent),
    ).toContain('Short property: short');
    expect(
      Array.from(container.querySelectorAll('svg title')).map((title) => title.textContent),
    ).toContain('Numeric property: 42');
    expect(
      Array.from(container.querySelectorAll('svg title')).map((title) => title.textContent),
    ).toContain('Boolean property: false');
  });

  it('shows the selected node label alongside metadata bubbles', () => {
    const { container } = renderGraph();
    clickNode(container, 'Wall');

    expect(getMetadataBubble(container, 'label').querySelectorAll('text')[1]?.textContent).toBe(
      'Test wall',
    );
    expect(
      Array.from(container.querySelectorAll('svg title')).map((title) => title.textContent),
    ).toContain('label: Test wall');
  });

  it('shows the selected node label when it has no metadata', () => {
    const buildingOnlyGraph = {
      ...graph,
      nodes: [graph.nodes[0]],
    };
    useRuleBookStore.getState().setActiveGraphData(buildingOnlyGraph);
    const { container } = renderGraph();
    clickNode(container, 'Building');

    expect(getMetadataBubble(container, 'label').querySelectorAll('text')[1]?.textContent).toBe(
      'Test building',
    );
  });

  it('shows the complete node label on hover and keyboard focus while shortening the bubble text', () => {
    const longLabel = 'A descriptive wall label exceeding twenty characters';
    useRuleBookStore.getState().setActiveGraphData({
      ...graph,
      nodes: graph.nodes.map((node) =>
        node.id === 'wall-1' ? { ...node, label: longLabel } : node,
      ),
    });
    const { container } = renderGraph();
    clickNode(container, 'Wall');
    const bubble = getMetadataBubble(container, 'label');

    expect(bubble.querySelectorAll('text')[1]?.textContent).toBe(`${longLabel.slice(0, 20)}...`);

    fireEvent.mouseEnter(bubble);
    expect(getHoverDetails(container)?.textContent).toBe(`label: ${longLabel}`);

    fireEvent.mouseLeave(bubble);
    fireEvent.focus(bubble);
    expect(getHoverDetails(container)?.textContent).toBe(`label: ${longLabel}`);
  });

  it('prefers the node label and reserves a bubble within the eight-property limit', () => {
    useRuleBookStore.getState().setActiveGraphData({
      ...graph,
      nodes: graph.nodes.map((node) =>
        node.id === 'wall-1'
          ? {
              ...node,
              metadata: {
                label: 'Incorrect metadata label',
                first: 'one',
                second: 'two',
                third: 'three',
                fourth: 'four',
                fifth: 'five',
                sixth: 'six',
                seventh: 'seven',
                eighth: 'eight',
              },
            }
          : node,
      ),
    });
    const { container } = renderGraph();
    clickNode(container, 'Wall');

    const titles = Array.from(container.querySelectorAll('svg title')).map(
      (title) => title.textContent,
    );
    expect(titles).toContain('label: Test wall');
    expect(titles).not.toContain('label: Incorrect metadata label');
    expect(titles).toContain('seventh: seven');
    expect(titles).not.toContain('eighth: eight');
  });

  it('shows complete metadata details on hover and hides them on leave', () => {
    const { container } = renderGraph();
    clickNode(container, 'Wall');
    const bubble = getMetadataBubble(container, 'Long property');

    fireEvent.mouseEnter(bubble);

    expect(getHoverDetails(container)?.textContent).toBe(
      'Long property: A full metadata value longer than twenty characters',
    );

    fireEvent.mouseLeave(bubble);

    expect(getHoverDetails(container)).toBeNull();
  });

  it('updates metadata hover details when moving between bubbles, including numeric and false values', () => {
    const { container } = renderGraph();
    clickNode(container, 'Wall');

    fireEvent.mouseEnter(getMetadataBubble(container, 'Short property'));
    expect(getHoverDetails(container)?.textContent).toBe('Short property: short');

    fireEvent.mouseEnter(getMetadataBubble(container, 'Numeric property'));
    expect(getHoverDetails(container)?.textContent).toBe('Numeric property: 42');

    fireEvent.mouseEnter(getMetadataBubble(container, 'Boolean property'));
    expect(getHoverDetails(container)?.textContent).toBe('Boolean property: false');
  });

  it('shows metadata details on keyboard focus, hides on blur, and retains node hover labels', () => {
    const { container } = renderGraph();
    clickNode(container, 'Wall');
    const bubble = getMetadataBubble(container, 'Short property');

    expect(bubble.getAttribute('tabindex')).toBe('0');
    fireEvent.focus(bubble);
    expect(getHoverDetails(container)?.textContent).toBe('Short property: short');

    fireEvent.blur(bubble);
    expect(getHoverDetails(container)).toBeNull();

    fireEvent.mouseEnter(getNode(container, 'Building'));
    expect(getHoverDetails(container)?.textContent).toBe('Test building');
  });

  it('does not retain metadata hover details after the selected node changes', () => {
    const { container } = renderGraph();
    clickNode(container, 'Wall');
    fireEvent.mouseEnter(getMetadataBubble(container, 'Long property'));
    expect(getHoverDetails(container)?.textContent).toContain('Long property:');

    clickNode(container, 'Building');

    expect(getHoverDetails(container)).toBeNull();
  });
});

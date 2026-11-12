import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import BarList from './BarList';
import UsageMeter from './UsageMeter';

const TB = 1_000_000_000_000;

describe('UsageMeter', () => {
  it('exposes the usage as an accessible meter', () => {
    const html = renderToStaticMarkup(
      <UsageMeter label="Object storage" usedBytes={TB / 4} limitBytes={TB} warnRatio={0.8} />,
    );
    expect(html).toContain('role="meter"');
    expect(html).toContain('aria-valuemin="0"');
    expect(html).toContain(`aria-valuemax="${TB}"`);
    expect(html).toContain(`aria-valuenow="${TB / 4}"`);
    expect(html).toContain('aria-valuetext="232.8 GiB of 931.3 GiB (25%)"');
    expect(html).toContain('bg-orange-600');
    expect(html).toContain('Within limits');
  });

  it('switches to the warning colour at the warning ratio', () => {
    const html = renderToStaticMarkup(
      <UsageMeter label="Object storage" usedBytes={0.85 * TB} limitBytes={TB} warnRatio={0.8} />,
    );
    expect(html).toContain('bg-yellow-500');
    expect(html).toContain('Above warning threshold');
  });

  it('caps the bar and says so when the limit is reached', () => {
    const html = renderToStaticMarkup(
      <UsageMeter label="Object storage" usedBytes={1.2 * TB} limitBytes={TB} warnRatio={0.8} />,
    );
    expect(html).toContain('bg-red-600');
    expect(html).toContain('width:100%');
    expect(html).toContain(`aria-valuenow="${TB}"`);
  });

  it('renders no meter without a limit', () => {
    const html = renderToStaticMarkup(
      <UsageMeter label="Object storage" usedBytes={2048} limitBytes={0} warnRatio={0.8} />,
    );
    expect(html).not.toContain('role="meter"');
    expect(html).toContain('2 KiB used, no limit configured');
  });
});

describe('BarList', () => {
  it('scales bars to the largest value and keeps numbers as text', () => {
    const html = renderToStaticMarkup(
      <BarList
        label="Storage by prefix"
        items={[
          { key: 'models', label: 'models/', value: 200, display: '200 B' },
          { key: 'ids', label: 'ids/', value: 50, display: '50 B', detail: '3 objects' },
        ]}
      />,
    );
    expect(html).toContain('aria-label="Storage by prefix"');
    expect(html).toContain('width:100%');
    expect(html).toContain('width:25%');
    expect(html).toContain('3 objects');
  });

  it('shows the empty text without items', () => {
    expect(renderToStaticMarkup(<BarList label="x" items={[]} emptyText="Nothing" />)).toContain(
      'Nothing',
    );
  });
});

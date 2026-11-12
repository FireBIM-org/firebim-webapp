import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import Layout from './Layout';

// In the browser next/head renders nothing itself and only re-creates plain meta/link/
// script/... elements in document.head, so a component placed inside it never mounts.
// Mock it that way to check that the analytics tag is rendered somewhere that does mount.
vi.mock('next/head', () => ({ default: () => null }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock('next/router', () => ({ useRouter: () => ({ pathname: '/dashboard' }) }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: null, logout: vi.fn() }) }));
vi.mock('./Analytics', () => ({ default: () => <span data-testid="analytics" /> }));

describe('Layout', () => {
  it('renders Analytics outside next/head so it mounts in the browser', () => {
    const html = renderToStaticMarkup(<Layout>content</Layout>);
    expect(html).toContain('data-testid="analytics"');
    expect(html).toContain('content');
  });
});

import type { NextAuthOptions } from 'next-auth';
import type { JWT } from 'next-auth/jwt';

import NextAuth from 'next-auth';

if (!process.env.AUTHENTIK_ISSUER_URL) {
  throw new Error('AUTHENTIK_ISSUER_URL environment variable is required');
}

const issuerUrl = process.env.AUTHENTIK_ISSUER_URL.replace(/\/+$/, '');

async function refreshAccessToken(token: JWT): Promise<JWT> {
  try {
    const discovery = await fetch(`${issuerUrl}/.well-known/openid-configuration`);
    const { token_endpoint } = await discovery.json();

    const response = await fetch(token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.AUTHENTIK_CLIENT_ID!,
        client_secret: process.env.AUTHENTIK_CLIENT_SECRET!,
        grant_type: 'refresh_token',
        refresh_token: token.refreshToken as string,
      }),
    });

    const refreshed = await response.json();

    if (!response.ok) {
      console.error('Token refresh failed:', refreshed);
      return { ...token, error: 'RefreshAccessTokenError' };
    }

    return {
      ...token,
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token ?? token.refreshToken,
      expiresAt: Math.floor(Date.now() / 1000) + (refreshed.expires_in ?? 300),
    };
  } catch (error) {
    console.error('Error refreshing access token:', error);
    return { ...token, error: 'RefreshAccessTokenError' };
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    {
      id: 'authentik',
      name: 'Authentik',
      type: 'oauth',
      wellKnown: `${issuerUrl}/.well-known/openid-configuration`,
      idToken: true,
      clientId: process.env.AUTHENTIK_CLIENT_ID,
      clientSecret: process.env.AUTHENTIK_CLIENT_SECRET,
      authorization: { params: { scope: 'openid email profile offline_access' } },
      client: {
        token_endpoint_auth_method: 'client_secret_post',
      },
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.name || profile.preferred_username,
          email: profile.email,
          username: profile.preferred_username,
        };
      },
    },
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      // On initial sign-in, persist tokens from the OIDC provider
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;
      }
      if (profile) {
        token.username = (profile as Record<string, unknown>).preferred_username as string;
      }

      // If access token hasn't expired, return as-is
      if (typeof token.expiresAt === 'number' && Date.now() / 1000 < token.expiresAt - 30) {
        return token;
      }

      // Access token expired, attempt refresh
      if (token.refreshToken) {
        return refreshAccessToken(token);
      }

      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string | undefined;
      session.error = token.error as string | undefined;
      if (session.user) {
        session.user.id = token.sub ?? '';
        session.user.username = token.username;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
};

export default NextAuth(authOptions);

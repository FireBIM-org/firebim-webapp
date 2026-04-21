import NextAuth from "next-auth";
import type { NextAuthOptions } from "next-auth";
import type { JWT } from "next-auth/jwt";

if (!process.env.AUTHENTIK_ISSUER_URL) {
  throw new Error("AUTHENTIK_ISSUER_URL environment variable is required");
}

// Public issuer URL — used for browser-facing OAuth redirects and the NextAuth wellKnown config.
const issuerUrl = process.env.AUTHENTIK_ISSUER_URL.replace(/\/+$/, "");

// Internal issuer URL — used for server-side token refresh requests.
// In containerised / K8s deployments the public URL may not be reachable from inside
// the pod (hairpin NAT / network policy). Set AUTHENTIK_INTERNAL_ISSUER_URL to the
// cluster-internal address (e.g. http://authentik-server:9000/application/o/firebim/).
// Falls back to the public issuerUrl if not set (works fine in local dev).
const internalIssuerUrl = (
  process.env.AUTHENTIK_INTERNAL_ISSUER_URL?.trim() || process.env.AUTHENTIK_ISSUER_URL
).replace(/\/+$/, "");

let discoveryPromise: Promise<{ token_endpoint: string }> | null = null;

async function getDiscovery() {
  if (!discoveryPromise) {
    discoveryPromise = fetch(
      `${internalIssuerUrl}/.well-known/openid-configuration`
    ).then(async (response) => {
      if (!response.ok) {
        throw new Error(`OIDC discovery failed: ${response.status}`);
      }

      return response.json() as Promise<{ token_endpoint: string }>;
    }).catch((error) => {
      discoveryPromise = null;
      throw error;
    });
  }

  return discoveryPromise;
}

async function refreshAccessToken(token: JWT): Promise<JWT> {
  try {
    const { token_endpoint } = await getDiscovery();

    const response = await fetch(token_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.AUTHENTIK_CLIENT_ID!,
        client_secret: process.env.AUTHENTIK_CLIENT_SECRET!,
        grant_type: "refresh_token",
        refresh_token: token.refreshToken as string,
      }),
    });

    const refreshed = await response.json();

    if (!response.ok) {
      console.error("Token refresh failed:", refreshed);
      // 400 invalid_grant or 401 = refresh token is definitively dead → force re-login.
      // Other failures (5xx, network blip) are transient; return the current token without
      // the error flag so the next request retries the refresh automatically.
      if (response.status === 400 || response.status === 401) {
        return { ...token, error: "RefreshAccessTokenError" };
      }
      return token;
    }

    return {
      ...token,
      error: undefined,
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token ?? token.refreshToken,
      expiresAt: Math.floor(Date.now() / 1000) + (refreshed.expires_in ?? 300),
    };
  } catch (error) {
    // Network error or discovery failure — treat as transient.
    // Return the current token WITHOUT an error flag so the next request retries the refresh.
    console.error("Error refreshing access token:", error);
    return token;
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    {
      id: "authentik",
      name: "Authentik",
      type: "oauth",
      wellKnown: `${issuerUrl}/.well-known/openid-configuration`,
      idToken: true,
      clientId: process.env.AUTHENTIK_CLIENT_ID,
      clientSecret: process.env.AUTHENTIK_CLIENT_SECRET,
      authorization: { params: { scope: "openid email profile offline_access" } },
      client: {
        token_endpoint_auth_method: "client_secret_post",
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
        token.username = (profile as Record<string, unknown>)
          .preferred_username as string;
      }

      // If refresh already failed, stop retrying — let the client force re-login
      if (token.error === "RefreshAccessTokenError") {
        return token;
      }

      // If access token hasn't expired, return as-is
      if (
        typeof token.expiresAt === "number" &&
        Date.now() / 1000 < token.expiresAt - 30
      ) {
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
        session.user.id = token.sub ?? "";
        session.user.username = token.username;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};

export default NextAuth(authOptions);

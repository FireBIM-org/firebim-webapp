import NextAuth from "next-auth";
import type { NextAuthOptions } from "next-auth";

// Public-facing Authentik issuer URL (browser redirects & ID token validation)
if (!process.env.AUTHENTIK_ISSUER_URL) {
  throw new Error("AUTHENTIK_ISSUER_URL environment variable is required");
}
const issuerUrl = process.env.AUTHENTIK_ISSUER_URL;

// External base URL for browser-facing endpoints
const externalBase = issuerUrl.replace(/\/application\/o\/.*$/, "");

// Internal Authentik base URL for server-side calls (avoids hairpin NAT in K8s).
// Falls back to external if not set (local development).
const serverBase = process.env.AUTHENTIK_INTERNAL_URL
  ? process.env.AUTHENTIK_INTERNAL_URL.replace(/\/$/, "")
  : externalBase;

export const authOptions: NextAuthOptions = {
  providers: [
    {
      id: "authentik",
      name: "Authentik",
      type: "oauth",
      // No wellKnown — the discovered endpoints use the internal hostname
      // which would leak into browser redirects. Define all endpoints explicitly.
      issuer: issuerUrl,
      authorization: {
        url: `${externalBase}/application/o/authorize/`,
        params: { scope: "openid email profile" },
      },
      token: `${serverBase}/application/o/token/`,
      userinfo: `${serverBase}/application/o/userinfo/`,
      jwks_endpoint: `${serverBase}/application/o/firebim/jwks/`,
      clientId: process.env.AUTHENTIK_CLIENT_ID,
      clientSecret: process.env.AUTHENTIK_CLIENT_SECRET,
      idToken: true,
      checks: ["pkce", "state"],
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
      // Persist the access_token from the OAuth provider into the JWT
      if (account) {
        token.accessToken = account.access_token;
      }
      if (profile) {
        token.username = (profile as Record<string, unknown>).preferred_username as string;
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string | undefined;
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

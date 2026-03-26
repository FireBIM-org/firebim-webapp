import NextAuth from "next-auth";
import type { NextAuthOptions } from "next-auth";

if (!process.env.AUTHENTIK_ISSUER_URL) {
  throw new Error("AUTHENTIK_ISSUER_URL environment variable is required");
}

export const authOptions: NextAuthOptions = {
  providers: [
    {
      id: "authentik",
      name: "Authentik",
      type: "oauth",
      wellKnown: `${process.env.AUTHENTIK_ISSUER_URL}/.well-known/openid-configuration`,
      authorization: { params: { scope: "openid email profile" } },
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

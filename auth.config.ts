import type { NextAuthOptions } from "next-auth"
import CognitoProvider from "next-auth/providers/cognito"
import { query } from "@/lib/db"

export const authOptions: NextAuthOptions = {
  providers: [
    CognitoProvider({
      clientId: process.env.COGNITO_CLIENT_ID!,
      clientSecret: process.env.COGNITO_CLIENT_SECRET!,
      issuer: process.env.COGNITO_ISSUER!,
      authorization: {
        params: {
          prompt: "login"
        }
      }
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      // On initial sign-in, `account`/`profile` are populated. Cognito's
      // `sub` claim is the stable, unique user identifier - persist it on
      // the token so it's available on every subsequent request without
      // re-hitting Cognito.
      if (account && profile?.sub) {
        token.sub = profile.sub

        // Upsert the user row keyed by Cognito sub. Idempotent - safe to run
        // on every sign-in.
        await query(
          `INSERT INTO users (id, email)
           VALUES ($1, $2)
           ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email`,
          [profile.sub, (profile as { email?: string }).email ?? null],
        )
      }
      return token
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub
      }
      return session
    },
  },
  pages: {
    signIn: "/login",
  },
}
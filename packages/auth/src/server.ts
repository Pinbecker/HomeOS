import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { db } from '@homeos/db'
import * as schema from '@homeos/db/schema'

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  trustedOrigins: [
    process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    process.env.VITE_APP_URL ?? 'http://localhost:5173',
  ],

  database: drizzleAdapter(db, {
    provider: 'sqlite',
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
    },
  }),

  emailAndPassword: {
    enabled: true,
    // Only allow login for existing accounts — no public registration
    disableSignUp: true,
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30,       // 30 days
    updateAge: 60 * 60 * 24,             // Refresh if older than 1 day
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
  },

  advanced: {
    cookiePrefix: 'hearth',
    useSecureCookies: process.env.NODE_ENV === 'production',
  },
})

export type Session = typeof auth.$Infer.Session
export type User = typeof auth.$Infer.Session.user

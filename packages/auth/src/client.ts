'use client'
import { createAuthClient } from 'better-auth/react'

const browserBaseUrl = typeof window !== 'undefined'
  ? window.location.origin
  : process.env.BETTER_AUTH_URL
    ?? process.env.NEXT_PUBLIC_APP_URL
    ?? process.env.VITE_API_BASE_URL
    ?? process.env.VITE_APP_URL
    ?? 'http://localhost:3000'

export const authClient = createAuthClient({
  baseURL: browserBaseUrl,
})

export const { signIn, signOut, useSession, changePassword } = authClient

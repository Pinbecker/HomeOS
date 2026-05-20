'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from '@/lib/auth/client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const result = await signIn.email({ email, password })

    if (result.error) {
      setError('Incorrect email or password. Try again.')
      setLoading(false)
      return
    }

    router.push('/')
    router.refresh()
  }

  return (
    <div className="min-h-dvh bg-bg flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent mb-4 shadow-lg shadow-accent/25">
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
              <path d="M3 10.5L12 3l9 7.5" />
              <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
              <path d="M10 21v-5a2 2 0 0 1 4 0v5" />
            </svg>
          </div>
          <h1 className="text-2xl font-extrabold text-text-1 tracking-tight">HomeOS</h1>
          <p className="text-sm text-text-2 mt-1">Your shared home</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full h-12 bg-surface border border-border rounded-xl px-4 text-[15px] text-text-1 placeholder:text-text-3 font-medium outline-none focus:border-accent transition-colors"
            />
          </div>

          <div>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full h-12 bg-surface border border-border rounded-xl px-4 text-[15px] text-text-1 placeholder:text-text-3 font-medium outline-none focus:border-accent transition-colors"
            />
          </div>

          {error && (
            <p className="text-sm text-red font-medium text-center py-1">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 bg-accent hover:opacity-90 active:opacity-80 text-white font-bold text-[15px] rounded-xl transition-opacity disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-xs text-text-3 mt-8">
          Private — for Dan &amp; Imogen only
        </p>
      </div>
    </div>
  )
}

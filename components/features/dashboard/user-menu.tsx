'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signOut, changePassword } from '@/lib/auth/client'

type View = 'menu' | 'password'

export function UserMenu({ user }: { user: { name: string; email: string } }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<View>('menu')

  // change-password form state
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  function close() {
    setOpen(false)
    // reset after the sheet closes
    setTimeout(() => {
      setView('menu'); setCurrent(''); setNext(''); setConfirm(''); setError(''); setDone(false); setBusy(false)
    }, 200)
  }

  async function handleLogout() {
    setBusy(true)
    await signOut()
    router.push('/login')
    router.refresh()
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (next.length < 8) { setError('New password must be at least 8 characters.'); return }
    if (next !== confirm) { setError('New passwords do not match.'); return }
    setBusy(true)
    const res = await changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: false })
    setBusy(false)
    if (res.error) {
      setError(res.error.message ?? 'Could not change password. Check your current password.')
      return
    }
    setDone(true)
    setCurrent(''); setNext(''); setConfirm('')
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-9 h-9 rounded-full bg-accent flex items-center justify-center text-white text-[13px] font-bold shrink-0 mt-1 active:scale-95 transition-transform"
        aria-label="Account menu"
      >
        {user.name.charAt(0).toUpperCase()}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end max-w-lg mx-auto" >
          {/* Backdrop */}
          <button className="absolute inset-0 bg-black/30" aria-label="Close" onClick={close} />

          {/* Sheet */}
          <div className="relative bg-bg rounded-t-3xl p-4 pb-[calc(env(safe-area-inset-bottom)+16px)] safe-bottom">
            {view === 'menu' ? (
              <>
                {/* Account header */}
                <div className="flex items-center gap-3 px-2 py-3 mb-2">
                  <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center text-white text-[18px] font-bold shrink-0">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[17px] font-bold text-text-1 truncate">{user.name}</p>
                    <p className="text-[13px] text-text-2 truncate">{user.email}</p>
                  </div>
                </div>

                <div className="bg-surface rounded-2xl overflow-hidden mb-3">
                  <button
                    onClick={() => setView('password')}
                    className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-surface-2 text-left"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="w-[19px] h-[19px] text-text-2">
                      <rect x="3" y="11" width="18" height="11" rx="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    <span className="flex-1 text-[15px] font-medium text-text-1">Change Password</span>
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-text-3">
                      <path d="M6 4l4 4-4 4" />
                    </svg>
                  </button>
                  <button
                    onClick={handleLogout}
                    disabled={busy}
                    className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-surface-2 text-left border-t border-border disabled:opacity-50"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="w-[19px] h-[19px] text-red">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    <span className="flex-1 text-[15px] font-semibold text-red">{busy ? 'Logging out…' : 'Log Out'}</span>
                  </button>
                </div>

                <button onClick={close} className="w-full h-12 rounded-2xl bg-surface text-[16px] font-semibold text-accent active:opacity-70">
                  Cancel
                </button>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between px-1 py-2 mb-1">
                  <button onClick={() => { setView('menu'); setError(''); setDone(false) }} className="text-accent text-[16px] active:opacity-60">
                    Back
                  </button>
                  <span className="text-[16px] font-semibold text-text-1">Change Password</span>
                  <span className="w-10" />
                </div>

                {done ? (
                  <div className="bg-surface rounded-2xl px-4 py-6 text-center mb-3">
                    <div className="w-12 h-12 rounded-full bg-sage/15 flex items-center justify-center mx-auto mb-3">
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-sage">
                        <path d="M3 8l3.5 3.5L13 4.5" />
                      </svg>
                    </div>
                    <p className="text-[15px] font-semibold text-text-1">Password updated</p>
                    <button onClick={close} className="mt-4 text-accent text-[15px] font-semibold active:opacity-60">Done</button>
                  </div>
                ) : (
                  <form onSubmit={handleChangePassword} className="flex flex-col gap-3">
                    <div className="bg-surface rounded-2xl overflow-hidden">
                      <input
                        type="password" value={current} onChange={e => setCurrent(e.target.value)}
                        placeholder="Current password" autoComplete="current-password" required
                        className="w-full px-4 py-3 text-[15px] text-text-1 placeholder:text-text-3 bg-transparent outline-none"
                      />
                      <input
                        type="password" value={next} onChange={e => setNext(e.target.value)}
                        placeholder="New password" autoComplete="new-password" required
                        className="w-full px-4 py-3 text-[15px] text-text-1 placeholder:text-text-3 bg-transparent outline-none border-t border-border"
                      />
                      <input
                        type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                        placeholder="Confirm new password" autoComplete="new-password" required
                        className="w-full px-4 py-3 text-[15px] text-text-1 placeholder:text-text-3 bg-transparent outline-none border-t border-border"
                      />
                    </div>
                    {error && <p className="text-[13px] text-red font-medium px-1">{error}</p>}
                    <button
                      type="submit" disabled={busy || !current || !next || !confirm}
                      className="w-full h-12 rounded-2xl bg-accent text-white text-[16px] font-bold active:opacity-80 disabled:opacity-40"
                    >
                      {busy ? 'Updating…' : 'Update Password'}
                    </button>
                  </form>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

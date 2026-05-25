'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Application, CsvHistoryEntry, ImportRow } from '@/lib/types'
import { downloadCsv, parseCsv } from '@/lib/csv'
import { useTheme } from '@/components/ui/ThemeProvider'

interface NavbarProps {
  userEmail: string
  applications: Application[]
  onImport: (rows: ImportRow[]) => Promise<void>
  onNewApplication: () => void
}

export default function Navbar({ userEmail, applications, onImport, onNewApplication }: NavbarProps) {
  const supabase = createClient()
  const router = useRouter()
  const { theme, toggleTheme } = useTheme()
  const [importing, setImporting] = useState(false)
  const [featureOpen, setFeatureOpen] = useState(false)
  const [featureTitle, setFeatureTitle] = useState('')
  const [featureDesc, setFeatureDesc] = useState('')
  const [featureStatus, setFeatureStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')

  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteMessage, setInviteMessage] = useState('')
  const [inviteStatus, setInviteStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')

  const [securityOpen, setSecurityOpen] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [securityStatus, setSecurityStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [securityError, setSecurityError] = useState('')

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  async function handleFeatureSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFeatureStatus('submitting')
    try {
      const res = await fetch('/api/feature-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: featureTitle, description: featureDesc }),
      })
      if (!res.ok) throw new Error('Failed')
      setFeatureStatus('success')
      setFeatureTitle('')
      setFeatureDesc('')
    } catch {
      setFeatureStatus('error')
    }
  }

  function handleFeatureClose() {
    setFeatureOpen(false)
    setFeatureStatus('idle')
    setFeatureTitle('')
    setFeatureDesc('')
  }

  async function handleInviteSubmit(e: React.FormEvent) {
    e.preventDefault()
    setInviteStatus('submitting')
    try {
      const res = await fetch('/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: inviteEmail, name: inviteName, message: inviteMessage }),
      })
      if (!res.ok) throw new Error('Failed')
      setInviteStatus('success')
    } catch {
      setInviteStatus('error')
    }
  }

  function handleInviteClose() {
    setInviteOpen(false)
    setInviteStatus('idle')
    setInviteEmail('')
    setInviteName('')
    setInviteMessage('')
  }

  async function handleSecuritySubmit(e: React.FormEvent) {
    e.preventDefault()
    setSecurityError('')

    if (newPassword.length < 8) {
      setSecurityError('Password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setSecurityError('Passwords do not match.')
      return
    }

    setSecurityStatus('submitting')
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      setSecurityStatus('success')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong'
      console.error('updateUser password failed:', msg, err)
      setSecurityError(msg)
      setSecurityStatus('error')
    }
  }

  function handleSecurityClose() {
    setSecurityOpen(false)
    setSecurityStatus('idle')
    setSecurityError('')
    setNewPassword('')
    setConfirmPassword('')
  }

  async function handleExport() {
    const ids = applications.map(a => a.id)
    let historyMap: Map<string, CsvHistoryEntry[]> | undefined
    if (ids.length > 0) {
      const { data } = await supabase
        .from('status_history')
        .select('application_id, status, changed_at')
        .in('application_id', ids)
        .order('changed_at', { ascending: true })
      if (data) {
        historyMap = new Map()
        for (const row of data) {
          const arr = historyMap.get(row.application_id) ?? []
          arr.push({ status: row.status, changed_at: row.changed_at })
          historyMap.set(row.application_id, arr)
        }
      }
    }
    downloadCsv(applications, historyMap)
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    try {
      const text = await file.text()
      const rows = parseCsv(text)
      await onImport(rows)
    } finally {
      setImporting(false)
      e.target.value = ''
    }
  }

  return (
    <>
    <nav
      className="h-[var(--nav-height)] flex items-center justify-between px-4 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 z-10"
      style={{ height: 'var(--nav-height)' }}
    >
      <div className="flex items-center">
        <Image
          src="/brand/lockup-light.svg"
          alt="ApplyTrackr"
          width={200}
          height={40}
          priority
          className="block dark:hidden"
        />
        <Image
          src="/brand/lockup-dark.svg"
          alt="ApplyTrackr"
          width={200}
          height={40}
          priority
          className="hidden dark:block"
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onNewApplication}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Application
        </button>

        <button
          onClick={handleExport}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors"
          title="Export to CSV"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export
        </button>

        <label className={`inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors cursor-pointer ${importing ? 'opacity-50' : ''}`}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          {importing ? 'Importing…' : 'Import'}
          <input type="file" accept=".csv" className="sr-only" onChange={handleImport} disabled={importing} />
        </label>

        <div className="flex items-center gap-2 ml-2 pl-2 border-l border-slate-200 dark:border-slate-700">
          <span className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block truncate max-w-[140px]">{userEmail}</span>
          <span className="text-slate-200 dark:text-slate-600">|</span>
          <button
            onClick={() => setInviteOpen(true)}
            className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          >
            Invite
          </button>
          <span className="text-slate-200 dark:text-slate-600">|</span>
          <button
            onClick={() => setFeatureOpen(true)}
            className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
            title="Request a feature"
          >
            Feedback
          </button>
          <span className="text-slate-200 dark:text-slate-600">|</span>
          <Link
            href="/roadmap"
            className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          >
            Roadmap
          </Link>
          <span className="text-slate-200 dark:text-slate-600">|</span>
          <button
            onClick={() => setSecurityOpen(true)}
            className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
            title="Set or change your password"
          >
            Security
          </button>
          <span className="text-slate-200 dark:text-slate-600">|</span>
          <button
            onClick={handleSignOut}
            className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          >
            Sign out
          </button>
          <span className="text-slate-200 dark:text-slate-600">|</span>
          <button
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            {theme === 'dark' ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </nav>

    {inviteOpen && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        onClick={handleInviteClose}
      >
        <div
          className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md mx-4 p-6"
          onClick={e => e.stopPropagation()}
        >
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">Invite a friend</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Send them a link to Job Tracker with a personal note.
          </p>

          {inviteStatus === 'success' ? (
            <div className="text-center py-4">
              <p className="text-sm font-medium text-green-700 dark:text-green-400 mb-1">Invite sent!</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">They&apos;ll receive an email with a link to get started.</p>
              <button
                onClick={handleInviteClose}
                className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors"
              >
                Close
              </button>
            </div>
          ) : (
            <form onSubmit={handleInviteSubmit}>
              <div className="mb-3">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1" htmlFor="invite-email">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  id="invite-email"
                  type="email"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  placeholder="friend@example.com"
                  required
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="mb-3">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1" htmlFor="invite-name">
                  Name <span className="text-slate-400">( optional)</span>
                </label>
                <input
                  id="invite-name"
                  type="text"
                  value={inviteName}
                  onChange={e => setInviteName(e.target.value)}
                  placeholder="Alex"
                  maxLength={100}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="mb-4">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1" htmlFor="invite-message">
                  Personal note <span className="text-slate-400">(optional)</span>
                </label>
                <textarea
                  id="invite-message"
                  value={inviteMessage}
                  onChange={e => setInviteMessage(e.target.value)}
                  placeholder="Hey, I've been using this to track my job search…"
                  maxLength={500}
                  rows={3}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>

              {inviteStatus === 'error' && (
                <p className="text-xs text-red-600 dark:text-red-400 mb-3">Something went wrong — please try again.</p>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleInviteClose}
                  className="rounded-lg border border-slate-200 dark:border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviteStatus === 'submitting' || !inviteEmail.trim()}
                  className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {inviteStatus === 'submitting' ? 'Sending…' : 'Send invite'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    )}

    {securityOpen && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        onClick={handleSecurityClose}
      >
        <div
          className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md mx-4 p-6"
          onClick={e => e.stopPropagation()}
        >
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">Set or change password</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Set a password for the first time, or change your existing one.
          </p>

          {securityStatus === 'success' ? (
            <div className="text-center py-4">
              <p className="text-sm font-medium text-green-700 dark:text-green-400 mb-1">Password updated!</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">You can use it the next time you sign in.</p>
              <button
                onClick={handleSecurityClose}
                className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors"
              >
                Close
              </button>
            </div>
          ) : (
            <form onSubmit={handleSecuritySubmit}>
              <div className="mb-3">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1" htmlFor="security-new-password">
                  New password <span className="text-red-500">*</span>
                </label>
                <input
                  id="security-new-password"
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  minLength={8}
                  required
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="mb-4">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1" htmlFor="security-confirm-password">
                  Confirm password <span className="text-red-500">*</span>
                </label>
                <input
                  id="security-confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  minLength={8}
                  required
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {securityError && (
                <p className="text-xs text-red-600 dark:text-red-400 mb-3">{securityError}</p>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleSecurityClose}
                  className="rounded-lg border border-slate-200 dark:border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={securityStatus === 'submitting' || !newPassword || !confirmPassword}
                  className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {securityStatus === 'submitting' ? 'Saving…' : 'Save password'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    )}

    {featureOpen && (

      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        onClick={handleFeatureClose}
      >
        <div
          className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md mx-4 p-6"
          onClick={e => e.stopPropagation()}
        >
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">Request a feature</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Your request will be submitted as a GitHub issue for review.
          </p>

          {featureStatus === 'success' ? (
            <div className="text-center py-4">
              <p className="text-sm font-medium text-green-700 dark:text-green-400 mb-1">Request submitted!</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Thanks — we&apos;ll review it soon.</p>
              <button
                onClick={handleFeatureClose}
                className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors"
              >
                Close
              </button>
            </div>
          ) : (
            <form onSubmit={handleFeatureSubmit}>
              <div className="mb-3">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1" htmlFor="feature-title">
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  id="feature-title"
                  type="text"
                  value={featureTitle}
                  onChange={e => setFeatureTitle(e.target.value)}
                  placeholder="Describe the feature in one line"
                  maxLength={200}
                  required
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="mb-4">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1" htmlFor="feature-desc">
                  Description <span className="text-slate-400">(optional)</span>
                </label>
                <textarea
                  id="feature-desc"
                  value={featureDesc}
                  onChange={e => setFeatureDesc(e.target.value)}
                  placeholder="More context, use case, or examples"
                  maxLength={2000}
                  rows={4}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>

              {featureStatus === 'error' && (
                <p className="text-xs text-red-600 dark:text-red-400 mb-3">Something went wrong — please try again.</p>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleFeatureClose}
                  className="rounded-lg border border-slate-200 dark:border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={featureStatus === 'submitting' || !featureTitle.trim()}
                  className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {featureStatus === 'submitting' ? 'Submitting…' : 'Submit'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    )}
    </>
  )
}

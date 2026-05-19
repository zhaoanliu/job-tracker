'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Application, CsvHistoryEntry, ImportRow } from '@/lib/types'
import { downloadCsv, parseCsv } from '@/lib/csv'

interface NavbarProps {
  userEmail: string
  applications: Application[]
  onImport: (rows: ImportRow[]) => Promise<void>
  onNewApplication: () => void
}

export default function Navbar({ userEmail, applications, onImport, onNewApplication }: NavbarProps) {
  const supabase = createClient()
  const router = useRouter()
  const [importing, setImporting] = useState(false)
  const [featureOpen, setFeatureOpen] = useState(false)
  const [featureTitle, setFeatureTitle] = useState('')
  const [featureDesc, setFeatureDesc] = useState('')
  const [featureStatus, setFeatureStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')

  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteMessage, setInviteMessage] = useState('')
  const [inviteStatus, setInviteStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')

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
        body: JSON.stringify({ to: inviteEmail, message: inviteMessage }),
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
    setInviteMessage('')
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
      className="h-[var(--nav-height)] flex items-center justify-between px-4 bg-white border-b border-slate-200 z-10"
      style={{ height: 'var(--nav-height)' }}
    >
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </div>
        <span className="font-semibold text-slate-900 text-sm">Job Tracker</span>
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
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          title="Export to CSV"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export
        </button>

        <label className={`inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer ${importing ? 'opacity-50' : ''}`}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          {importing ? 'Importing…' : 'Import'}
          <input type="file" accept=".csv" className="sr-only" onChange={handleImport} disabled={importing} />
        </label>

        <div className="flex items-center gap-2 ml-2 pl-2 border-l border-slate-200">
          <span className="text-xs text-slate-500 hidden sm:block truncate max-w-[140px]">{userEmail}</span>
          <button
            onClick={() => setInviteOpen(true)}
            className="text-xs text-slate-500 hover:text-slate-700 transition-colors"
          >
            Invite
          </button>
          <button
            onClick={() => setFeatureOpen(true)}
            className="text-xs text-slate-500 hover:text-slate-700 transition-colors"
            title="Request a feature"
          >
            Feedback
          </button>
          <button
            onClick={handleSignOut}
            className="text-xs text-slate-500 hover:text-slate-700 transition-colors"
          >
            Sign out
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
          className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6"
          onClick={e => e.stopPropagation()}
        >
          <h2 className="text-sm font-semibold text-slate-900 mb-1">Invite a friend</h2>
          <p className="text-xs text-slate-500 mb-4">
            Send them a link to Job Tracker with a personal note.
          </p>

          {inviteStatus === 'success' ? (
            <div className="text-center py-4">
              <p className="text-sm font-medium text-green-700 mb-1">Invite sent!</p>
              <p className="text-xs text-slate-500 mb-4">They&apos;ll receive an email with a link to get started.</p>
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
                <label className="block text-xs font-medium text-slate-700 mb-1" htmlFor="invite-email">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  id="invite-email"
                  type="email"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  placeholder="friend@example.com"
                  required
                  className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="mb-4">
                <label className="block text-xs font-medium text-slate-700 mb-1" htmlFor="invite-message">
                  Personal note <span className="text-slate-400">(optional)</span>
                </label>
                <textarea
                  id="invite-message"
                  value={inviteMessage}
                  onChange={e => setInviteMessage(e.target.value)}
                  placeholder="Hey, I've been using this to track my job search…"
                  maxLength={500}
                  rows={3}
                  className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>

              {inviteStatus === 'error' && (
                <p className="text-xs text-red-600 mb-3">Something went wrong — please try again.</p>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleInviteClose}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
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

    {featureOpen && (

      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        onClick={handleFeatureClose}
      >
        <div
          className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6"
          onClick={e => e.stopPropagation()}
        >
          <h2 className="text-sm font-semibold text-slate-900 mb-1">Request a feature</h2>
          <p className="text-xs text-slate-500 mb-4">
            Your request will be submitted as a GitHub issue for review.
          </p>

          {featureStatus === 'success' ? (
            <div className="text-center py-4">
              <p className="text-sm font-medium text-green-700 mb-1">Request submitted!</p>
              <p className="text-xs text-slate-500 mb-4">Thanks — we&apos;ll review it soon.</p>
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
                <label className="block text-xs font-medium text-slate-700 mb-1" htmlFor="feature-title">
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
                  className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="mb-4">
                <label className="block text-xs font-medium text-slate-700 mb-1" htmlFor="feature-desc">
                  Description <span className="text-slate-400">(optional)</span>
                </label>
                <textarea
                  id="feature-desc"
                  value={featureDesc}
                  onChange={e => setFeatureDesc(e.target.value)}
                  placeholder="More context, use case, or examples"
                  maxLength={2000}
                  rows={4}
                  className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>

              {featureStatus === 'error' && (
                <p className="text-xs text-red-600 mb-3">Something went wrong — please try again.</p>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleFeatureClose}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
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

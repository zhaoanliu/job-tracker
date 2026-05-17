'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Application } from '@/lib/types'
import { downloadCsv, parseCsv } from '@/lib/csv'

interface NavbarProps {
  userEmail: string
  applications: Application[]
  onImport: (rows: Partial<Application>[]) => Promise<void>
  onNewApplication: () => void
}

export default function Navbar({ userEmail, applications, onImport, onNewApplication }: NavbarProps) {
  const supabase = createClient()
  const router = useRouter()
  const [importing, setImporting] = useState(false)

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  function handleExport() {
    downloadCsv(applications)
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    try {
      const text = await file.text()
      const rows = parseCsv(text)
      await onImport(rows as Partial<Application>[])
    } finally {
      setImporting(false)
      e.target.value = ''
    }
  }

  return (
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
            onClick={handleSignOut}
            className="text-xs text-slate-500 hover:text-slate-700 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </nav>
  )
}

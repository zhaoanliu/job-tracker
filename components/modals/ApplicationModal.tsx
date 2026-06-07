'use client'

import { useState, useEffect, useRef } from 'react'
import {
  Application,
  ApplicationFormData,
  ApplicationStatus,
  APPLICATION_TYPES,
  APPLICATION_PRIORITIES,
  APPLICATION_LOCATIONS,
  APPLICATION_WORKMODES,
  APPLICATION_SOURCES,
  STAGES,
  StatusHistoryEntry,
} from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { todayLocalDate } from '@/lib/utils'
import RichTextEditor from '@/components/modals/RichTextEditor'

interface ApplicationModalProps {
  application: Application | null
  defaultStatus: ApplicationStatus
  onSave: (data: Partial<ApplicationFormData>) => Promise<void>
  onDelete?: () => Promise<void>
  onClose: () => void
}

const EMPTY_FORM: ApplicationFormData = {
  company: '',
  role: null,
  team: null,
  status: 'future',
  type: null,
  priority: 'Medium',
  location: null,
  workmode: 'Hybrid',
  date: null,
  link: null,
  source: 'LinkedIn',
  referrer: null,
  notes: null,
  next_step: null,
  jd: null,
  order: 0,
}

type Section = 'details' | 'progress' | 'jd' | 'history'

export default function ApplicationModal({
  application,
  defaultStatus,
  onSave,
  onDelete,
  onClose,
}: ApplicationModalProps) {
  const [form, setForm] = useState<ApplicationFormData>(
    application
      ? {
          company: application.company ?? '',
          role: application.role,
          team: application.team,
          status: application.status,
          type: application.type,
          priority: application.priority,
          location: application.location,
          workmode: application.workmode,
          date: application.date,
          link: application.link,
          source: application.source,
          referrer: application.referrer,
          notes: application.notes,
          next_step: application.next_step,
          jd: application.jd,
          order: application.order,
        }
      : { ...EMPTY_FORM, status: defaultStatus, date: todayLocalDate() }
  )
  const isCustomLocation = application?.location != null && !APPLICATION_LOCATIONS.includes(application.location)
  const [locationMode, setLocationMode] = useState<'predefined' | 'custom'>(isCustomLocation ? 'custom' : 'predefined')
  const [customLocation, setCustomLocation] = useState<string>(isCustomLocation ? (application.location ?? '') : '')

  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [section, setSection] = useState<Section>('details')
  const [jdPreview, setJdPreview] = useState(false)
  const [history, setHistory] = useState<StatusHistoryEntry[]>([])
  const [isImporting, setIsImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const importErrorTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [importedHtml, setImportedHtml] = useState<string | null>(null)
  const [originalDescription, setOriginalDescription] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'original' | 'imported'>('imported')

  const firstInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    firstInputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!application) return
    const supabase = createClient()
    supabase
      .from('status_history')
      .select('*')
      .eq('application_id', application.id)
      .order('changed_at', { ascending: false })
      .then(({ data, error }) => {
        if (error && error.code !== 'PGRST205') console.error('status_history fetch failed:', error.message, error)
        if (data) setHistory(data as StatusHistoryEntry[])
      })
  }, [application?.id])

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  function set<K extends keyof ApplicationFormData>(key: K, value: ApplicationFormData[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.company?.trim()) {
      setError('Company is required')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const savedForm =
        importedHtml !== null && viewMode === 'imported'
          ? { ...form, jd: importedHtml }
          : form
      await onSave(savedForm)
    } catch (err: unknown) {
      console.error('Application save failed:', err)
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  function showImportError(message: string) {
    if (importErrorTimer.current) clearTimeout(importErrorTimer.current)
    setImportError(message)
    importErrorTimer.current = setTimeout(() => setImportError(null), 4000)
  }

  useEffect(() => {
    return () => {
      if (importErrorTimer.current) clearTimeout(importErrorTimer.current)
    }
  }, [])

  async function handleImport() {
    const url = form.link?.trim()
    if (!url) return
    setIsImporting(true)
    setImportError(null)
    try {
      const res = await fetch('/api/fetch-job-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        const message = body?.error ?? `Import failed (${res.status})`
        console.error('Import job description failed:', message)
        showImportError(message)
        return
      }
      const data = await res.json()
      const html: string = typeof data?.html === 'string' ? data.html : ''
      if (!form.jd || form.jd.trim() === '') {
        set('jd', html || null)
      } else if (html) {
        setOriginalDescription(form.jd)
        setImportedHtml(html)
        setViewMode('imported')
      }
      setSection('jd')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to import job description'
      console.error('Import job description failed:', message)
      showImportError(message)
    } finally {
      setIsImporting(false)
    }
  }

  useEffect(() => {
    if (importedHtml !== null && section !== 'jd') {
      setImportedHtml(null)
      setOriginalDescription(null)
      setViewMode('imported')
    }
  }, [section, importedHtml])

  async function handleDelete() {
    if (!onDelete) return
    setDeleting(true)
    try {
      await onDelete()
    } catch (err: unknown) {
      console.error('Application delete failed:', err)
      setError(err instanceof Error ? err.message : 'Failed to delete')
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  const inputClass =
    'w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder:text-slate-400 dark:placeholder:text-slate-500'
  const labelClass = 'block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1'
  const selectClass = inputClass

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Sheet */}
      <div className="relative z-10 w-full sm:max-w-2xl bg-white dark:bg-slate-800 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {application ? 'Edit Application' : 'New Application'}
          </h2>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Section tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-700 px-5">
          {([['details', 'Details'], ['progress', 'Progress'], ['jd', 'Job Description'], ['history', 'History']] as [Section, string][]).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSection(id)}
              className={`py-2.5 px-1 mr-4 text-xs font-medium border-b-2 -mb-px transition-colors ${
                section === id
                  ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {section === 'details' && (
              <div className="space-y-4">
                {/* Row 1: Company + Role + Team */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className={labelClass}>
                      Company <span className="text-red-400">*</span>
                    </label>
                    <input
                      ref={firstInputRef}
                      type="text"
                      required
                      value={form.company}
                      onChange={e => set('company', e.target.value)}
                      placeholder="e.g. Acme Corp"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Role</label>
                    <input
                      type="text"
                      value={form.role ?? ''}
                      onChange={e => set('role', e.target.value || null)}
                      placeholder="e.g. Principal Engineer"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Team</label>
                    <input
                      type="text"
                      value={form.team ?? ''}
                      onChange={e => set('team', e.target.value || null)}
                      placeholder="e.g. Platform Security"
                      className={inputClass}
                    />
                  </div>
                </div>

                {/* Row 2: Type + Priority */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Type</label>
                    <select
                      value={form.type ?? ''}
                      onChange={e => set('type', (e.target.value as ApplicationFormData['type']) || null)}
                      className={selectClass}
                    >
                      <option value="">— Select —</option>
                      {APPLICATION_TYPES.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Priority</label>
                    <select
                      value={form.priority}
                      onChange={e => set('priority', e.target.value as ApplicationFormData['priority'])}
                      className={selectClass}
                    >
                      {APPLICATION_PRIORITIES.map(p => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Row 3: Status + Date */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Stage</label>
                    <select
                      value={form.status}
                      onChange={e => set('status', e.target.value as ApplicationStatus)}
                      className={selectClass}
                    >
                      {STAGES.map(s => (
                        <option key={s.id} value={s.id}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Date</label>
                    <input
                      type="date"
                      value={form.date ?? ''}
                      onChange={e => set('date', e.target.value || null)}
                      className={inputClass}
                    />
                  </div>
                </div>

                {/* Row 4: Location + Workmode */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Location</label>
                    <select
                      aria-label="Location"
                      value={locationMode === 'custom' ? '__other__' : (form.location ?? '')}
                      onChange={e => {
                        if (e.target.value === '__other__') {
                          setLocationMode('custom')
                          set('location', customLocation || null)
                        } else {
                          setLocationMode('predefined')
                          setCustomLocation('')
                          set('location', (e.target.value as ApplicationFormData['location']) || null)
                        }
                      }}
                      className={selectClass}
                    >
                      <option value="">— Select —</option>
                      {APPLICATION_LOCATIONS.map(l => (
                        <option key={l} value={l}>{l}</option>
                      ))}
                      <option value="__other__">Other...</option>
                    </select>
                    {locationMode === 'custom' && (
                      <input
                        type="text"
                        value={customLocation}
                        onChange={e => {
                          setCustomLocation(e.target.value)
                          set('location', e.target.value || null)
                        }}
                        placeholder="e.g. Renton WA"
                        className={`${inputClass} mt-2`}
                        aria-label="Custom location"
                      />
                    )}
                  </div>
                  <div>
                    <label className={labelClass}>Work Mode</label>
                    <select
                      value={form.workmode}
                      onChange={e => set('workmode', e.target.value as ApplicationFormData['workmode'])}
                      className={selectClass}
                    >
                      {APPLICATION_WORKMODES.map(w => (
                        <option key={w} value={w}>{w}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Row 5: Source + Link */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Source</label>
                    <select
                      value={form.source}
                      onChange={e => set('source', e.target.value as ApplicationFormData['source'])}
                      className={selectClass}
                    >
                      {APPLICATION_SOURCES.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Job Posting URL</label>
                    {importError && (
                      <div
                        role="alert"
                        className="mb-1 rounded-md bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 px-2 py-1 text-[11px] text-red-700 dark:text-red-400"
                      >
                        {importError}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={form.link ?? ''}
                        onChange={e => set('link', e.target.value || null)}
                        placeholder="https://..."
                        className={inputClass}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (form.link) window.open(form.link, '_blank', 'noopener,noreferrer')
                        }}
                        disabled={!form.link}
                        aria-label="Open job posting in new tab"
                        title={form.link ? 'Open in new tab' : 'Enter a URL first'}
                        className="flex-shrink-0 rounded-lg border border-slate-300 px-2.5 flex items-center justify-center text-slate-600 hover:bg-slate-50 hover:text-indigo-600 transition-colors disabled:text-slate-300 disabled:hover:bg-transparent disabled:hover:text-slate-300 disabled:cursor-not-allowed"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </button>
                      {form.link && form.link.trim().length > 0 && (
                        <button
                          type="button"
                          onClick={handleImport}
                          disabled={isImporting}
                          aria-label="Import job description from URL"
                          aria-busy={isImporting}
                          title={isImporting ? 'Importing…' : 'Import job description from URL'}
                          className="flex-shrink-0 rounded-lg border border-slate-300 px-2.5 flex items-center justify-center text-slate-600 hover:bg-slate-50 hover:text-indigo-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isImporting ? (
                            <svg
                              role="status"
                              aria-label="Importing"
                              className="w-4 h-4 animate-spin"
                              fill="none"
                              viewBox="0 0 24 24"
                            >
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" />
                            </svg>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Referrer (always visible) */}
                <div>
                  <label className={labelClass}>Referrer</label>
                  <input
                    type="text"
                    value={form.referrer ?? ''}
                    onChange={e => set('referrer', e.target.value || null)}
                    placeholder="Name of referrer (if applicable)"
                    className={inputClass}
                  />
                </div>
              </div>
            )}

            {section === 'progress' && (
              <div className="space-y-4">
                <div>
                  <label className={labelClass}>Next Step</label>
                  <input
                    type="text"
                    value={form.next_step ?? ''}
                    onChange={e => set('next_step', e.target.value || null)}
                    placeholder="e.g. Follow up after interview on Friday"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Notes</label>
                  <textarea
                    rows={10}
                    value={form.notes ?? ''}
                    onChange={e => set('notes', e.target.value || null)}
                    placeholder="Recruiter name, salary range, interview impressions…"
                    className={`${inputClass} resize-none`}
                  />
                </div>
              </div>
            )}

            {section === 'jd' && (
              <div className="space-y-2">
                {importedHtml !== null ? (
                  <>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div
                        role="group"
                        aria-label="Compare original and imported description"
                        className="flex rounded-md border border-slate-200 dark:border-slate-600 overflow-hidden text-[11px] font-medium"
                      >
                        <button
                          type="button"
                          onClick={() => setViewMode('original')}
                          aria-pressed={viewMode === 'original'}
                          className={`px-2.5 py-0.5 transition-colors ${viewMode === 'original' ? 'bg-indigo-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
                        >
                          Original
                        </button>
                        <button
                          type="button"
                          onClick={() => setViewMode('imported')}
                          aria-pressed={viewMode === 'imported'}
                          className={`px-2.5 py-0.5 transition-colors ${viewMode === 'imported' ? 'bg-indigo-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
                        >
                          Imported
                        </button>
                      </div>
                    </div>
                    <div
                      data-testid="jd-comparison-view"
                      aria-readonly="true"
                      aria-label={viewMode === 'imported' ? 'Imported description (read-only)' : 'Original description (read-only)'}
                      className="jd-preview min-h-[18rem] max-h-[28rem] overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 p-3 text-sm text-slate-700 dark:text-slate-300"
                      dangerouslySetInnerHTML={{
                        __html: viewMode === 'imported' ? (importedHtml ?? '') : (originalDescription ?? ''),
                      }}
                    />
                  </>
                ) : (
                  <>
                <div className="flex items-center justify-between">
                  <label className={labelClass}>Job Description</label>
                  <div className="flex rounded-md border border-slate-200 dark:border-slate-600 overflow-hidden text-[11px] font-medium">
                    <button
                      type="button"
                      onClick={() => setJdPreview(false)}
                      className={`px-2.5 py-0.5 transition-colors ${!jdPreview ? 'bg-indigo-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setJdPreview(true)}
                      className={`px-2.5 py-0.5 transition-colors ${jdPreview ? 'bg-indigo-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
                    >
                      Preview
                    </button>
                  </div>
                </div>
                {jdPreview ? (
                  form.jd && /<[a-z][\s\S]*>/i.test(form.jd) ? (
                    <div
                      className="jd-preview min-h-[18rem] max-h-[28rem] overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 p-3 text-sm text-slate-700 dark:text-slate-300"
                      dangerouslySetInnerHTML={{ __html: form.jd }}
                    />
                  ) : (
                    <div className="jd-preview min-h-[18rem] max-h-[28rem] overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 p-3 text-sm text-slate-700 dark:text-slate-300">
                      <pre className="whitespace-pre-wrap font-sans text-sm text-slate-700 dark:text-slate-300 m-0">
                        {form.jd || <span className="text-slate-400 dark:text-slate-500 italic">Nothing to preview.</span>}
                      </pre>
                    </div>
                  )
                ) : (
                  <RichTextEditor
                    value={form.jd ?? ''}
                    onChange={html => set('jd', html || null)}
                    placeholder="Paste the full job description here…"
                  />
                )}
                  </>
                )}
              </div>
            )}

            {section === 'history' && (
              <div className="space-y-1">
                {history.length === 0 ? (
                  <p className="text-xs text-slate-400 py-6 text-center">No status history recorded yet.</p>
                ) : (
                  <ol className="relative border-l border-slate-200 dark:border-slate-700 ml-2">
                    {history.map((entry, i) => {
                      const stage = STAGES.find(s => s.id === entry.status)
                      const dt = new Date(entry.changed_at)
                      const date = dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                      const time = dt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
                      return (
                        <li key={entry.id} className="mb-4 ml-4">
                          <span className={`absolute -left-1.5 mt-1 w-3 h-3 rounded-full border-2 border-white dark:border-slate-800 ${stage?.dotClass ?? 'bg-slate-400'}`} />
                          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${stage?.headerClass ?? 'text-slate-600 bg-slate-100'}`}>
                            {stage?.label ?? entry.status}
                          </span>
                          <p className="text-[11px] text-slate-400 mt-0.5">{date} · {time}{i === history.length - 1 ? ' · initial' : ''}</p>
                        </li>
                      )
                    })}
                  </ol>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          {error && (
            <div className="mx-5 mb-1 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-700 dark:text-red-400">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-slate-200 dark:border-slate-700">
            {onDelete ? (
              confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Are you sure?</span>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="text-xs font-semibold text-red-600 hover:text-red-800 disabled:opacity-50"
                  >
                    {deleting ? 'Deleting…' : 'Confirm Delete'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="text-xs font-medium text-slate-400 hover:text-red-600 transition-colors"
                >
                  Delete application
                </button>
              )
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-200 dark:border-slate-600 px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving…' : application ? 'Save Changes' : 'Add Application'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

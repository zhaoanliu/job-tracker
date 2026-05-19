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
} from '@/lib/types'

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

type Section = 'details' | 'progress' | 'jd'

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
      : { ...EMPTY_FORM, status: defaultStatus }
  )
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [section, setSection] = useState<Section>('details')
  const [jdPreview, setJdPreview] = useState(false)

  const firstInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    firstInputRef.current?.focus()
  }, [])

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
      await onSave(form)
    } catch (err: unknown) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!onDelete) return
    setDeleting(true)
    try {
      await onDelete()
    } catch (err: unknown) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Failed to delete')
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  const inputClass =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder:text-slate-400'
  const labelClass = 'block text-xs font-medium text-slate-600 mb-1'
  const selectClass = inputClass

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Sheet */}
      <div className="relative z-10 w-full sm:max-w-2xl bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">
            {application ? 'Edit Application' : 'New Application'}
          </h2>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Section tabs */}
        <div className="flex border-b border-slate-200 px-5">
          {([['details', 'Details'], ['progress', 'Progress'], ['jd', 'Job Description']] as [Section, string][]).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSection(id)}
              className={`py-2.5 px-1 mr-4 text-xs font-medium border-b-2 -mb-px transition-colors ${
                section === id
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
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
                {/* Row 1: Company + Role */}
                <div className="grid grid-cols-2 gap-3">
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
                      value={form.location ?? ''}
                      onChange={e => set('location', (e.target.value as ApplicationFormData['location']) || null)}
                      className={selectClass}
                    >
                      <option value="">— Select —</option>
                      {APPLICATION_LOCATIONS.map(l => (
                        <option key={l} value={l}>{l}</option>
                      ))}
                    </select>
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
                    <input
                      type="url"
                      value={form.link ?? ''}
                      onChange={e => set('link', e.target.value || null)}
                      placeholder="https://..."
                      className={inputClass}
                    />
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
                <div className="flex items-center justify-between">
                  <label className={labelClass}>Job Description</label>
                  <div className="flex rounded-md border border-slate-200 overflow-hidden text-[11px] font-medium">
                    <button
                      type="button"
                      onClick={() => setJdPreview(false)}
                      className={`px-2.5 py-0.5 transition-colors ${!jdPreview ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setJdPreview(true)}
                      className={`px-2.5 py-0.5 transition-colors ${jdPreview ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                      Preview
                    </button>
                  </div>
                </div>
                {jdPreview ? (
                  <div
                    className="jd-preview min-h-[18rem] max-h-[28rem] overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"
                    {...(form.jd && /<[a-z][\s\S]*>/i.test(form.jd)
                      ? { dangerouslySetInnerHTML: { __html: form.jd } }
                      : {})}
                  >
                    {!(form.jd && /<[a-z][\s\S]*>/i.test(form.jd)) && (
                      <pre className="whitespace-pre-wrap font-sans text-sm text-slate-700 m-0">
                        {form.jd || <span className="text-slate-400 italic">Nothing to preview.</span>}
                      </pre>
                    )}
                  </div>
                ) : (
                  <textarea
                    rows={18}
                    value={form.jd ?? ''}
                    onChange={e => set('jd', e.target.value || null)}
                    placeholder="Paste the full job description here…"
                    className={`${inputClass} resize-none font-mono text-xs`}
                  />
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          {error && (
            <div className="mx-5 mb-1 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-slate-200">
            {onDelete ? (
              confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">Are you sure?</span>
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
                    className="text-xs text-slate-500 hover:text-slate-700"
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
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
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

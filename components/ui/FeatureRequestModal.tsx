'use client'

import { useState } from 'react'

interface FeatureRequestModalProps {
  open: boolean
  onClose: () => void
}

export default function FeatureRequestModal({ open, onClose }: FeatureRequestModalProps) {
  const [featureTitle, setFeatureTitle] = useState('')
  const [featureDesc, setFeatureDesc] = useState('')
  const [featureStatus, setFeatureStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')

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
    setFeatureStatus('idle')
    setFeatureTitle('')
    setFeatureDesc('')
    onClose()
  }

  if (!open) return null

  return (
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
  )
}

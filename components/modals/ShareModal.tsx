'use client'

import { useEffect, useState } from 'react'

interface ShareModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function ShareModal({ isOpen, onClose }: ShareModalProps) {
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) {
      setEmail('')
      setIsSubmitting(false)
      setSuccessMessage(null)
      setErrorMessage(null)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = email.trim()
    if (!trimmed) {
      setErrorMessage('Email address is required')
      return
    }
    setIsSubmitting(true)
    setSuccessMessage(null)
    setErrorMessage(null)
    try {
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        const message = body?.error ?? `Failed to send invitation (${res.status})`
        setErrorMessage(message)
        return
      }
      setSuccessMessage('Invitation sent')
      setEmail('')
    } catch (err: unknown) {
      console.error('Share invite failed:', err)
      setErrorMessage(err instanceof Error ? err.message : 'Failed to send invitation')
    } finally {
      setIsSubmitting(false)
    }
  }

  const inputClass =
    'w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder:text-slate-400 dark:placeholder:text-slate-500'
  const labelClass = 'block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1'

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      <div className="relative z-10 w-full sm:max-w-md bg-white dark:bg-slate-800 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Share board
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col">
          <div className="px-5 py-4 space-y-3">
            <div>
              <label htmlFor="share-email" className={labelClass}>
                Email address
              </label>
              <input
                id="share-email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="collaborator@example.com"
                className={inputClass}
                disabled={isSubmitting}
              />
            </div>

            {successMessage && (
              <div
                role="status"
                className="rounded-lg bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 px-3 py-2 text-xs text-green-700 dark:text-green-400"
              >
                {successMessage}
              </div>
            )}

            {errorMessage && (
              <div
                role="alert"
                className="rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-600 dark:text-red-400"
              >
                {errorMessage}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 dark:border-slate-600 px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {isSubmitting ? 'Sending…' : 'Send invite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

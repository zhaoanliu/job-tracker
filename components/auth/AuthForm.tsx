'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_RULES,
  validatePassword,
} from '@/lib/password'

type Mode = 'signin' | 'signup' | 'magic' | 'reset'

export default function AuthForm() {
  const supabase = createClient()
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'error' | 'success' } | null>(null)

  const passwordCheck = validatePassword(password)
  const blockSignupSubmit = mode === 'signup' && !passwordCheck.valid

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)

    if (mode === 'signup' && !passwordCheck.valid) {
      setMessage({ text: passwordCheck.message ?? 'Password does not meet requirements.', type: 'error' })
      return
    }

    setLoading(true)
    try {
      if (mode === 'magic') {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: `${location.origin}/auth/callback` },
        })
        if (error) throw error
        setMessage({ text: 'Check your email for a magic link!', type: 'success' })
      } else if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${location.origin}/auth/callback` },
        })
        if (error) throw error
        setMessage({ text: 'Account created! Check your email to confirm.', type: 'success' })
      } else if (mode === 'reset') {
        await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${location.origin}/auth/callback?next=/auth/reset-password`,
        })
        setMessage({
          text: "If that email exists, you'll receive a reset link shortly.",
          type: 'success',
        })
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        window.location.href = '/'
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong'
      setMessage({ text: msg, type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" suppressHydrationWarning>
      <div className="flex rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden text-sm">
        {(['signin', 'signup', 'magic'] as Mode[]).map(m => (
          <button
            key={m}
            type="button"
            onClick={() => { setMode(m); setMessage(null) }}
            className={`flex-1 py-2 font-medium transition-colors ${
              mode === m
                ? 'bg-indigo-600 text-white'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
            }`}
          >
            {m === 'signin' ? 'Sign In' : m === 'signup' ? 'Sign Up' : 'Magic Link'}
          </button>
        ))}
      </div>

      {mode === 'signin' && (
        <button
          type="button"
          onClick={() => { setEmail('demo@jobtracker.dev'); setPassword('demo1234'); setMessage(null) }}
          className="w-full rounded-lg border border-dashed border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/30 px-4 py-2 text-xs font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
        >
          Use demo account
        </button>
      )}

      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          suppressHydrationWarning
        />
      </div>

      {mode !== 'magic' && mode !== 'reset' && (
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            minLength={mode === 'signup' ? PASSWORD_MIN_LENGTH : 6}
            aria-invalid={mode === 'signup' && password.length > 0 && !passwordCheck.valid}
            aria-describedby={mode === 'signup' ? 'password-requirements' : undefined}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            suppressHydrationWarning
          />
          {mode === 'signup' && (
            <ul
              id="password-requirements"
              role="list"
              className="mt-2 space-y-1 text-xs"
            >
              {PASSWORD_RULES.map(rule => {
                const passed = rule.test(password)
                return (
                  <li
                    key={rule.id}
                    data-testid={`password-rule-${rule.id}`}
                    data-passed={passed}
                    className={passed ? 'text-green-600 dark:text-green-400' : 'text-slate-500 dark:text-slate-400'}
                  >
                    <span aria-hidden="true">{passed ? '✓' : '○'}</span>{' '}
                    {rule.label}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {mode === 'signin' && (
        <div className="text-right">
          <button
            type="button"
            onClick={() => { setMode('reset'); setMessage(null) }}
            className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
          >
            Forgot password?
          </button>
        </div>
      )}

      {mode === 'reset' && (
        <div>
          <button
            type="button"
            onClick={() => { setMode('signin'); setMessage(null) }}
            className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:underline"
          >
            ← Back to sign in
          </button>
        </div>
      )}

      {message && (
        <div
          className={`rounded-lg px-3 py-2 text-sm ${
            message.type === 'error'
              ? 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'
              : 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800'
          }`}
        >
          {message.text}
        </div>
      )}

      <button
        type="submit"
        disabled={loading || blockSignupSubmit}
        className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading
          ? 'Loading…'
          : mode === 'signin'
          ? 'Sign In'
          : mode === 'signup'
          ? 'Create Account'
          : mode === 'reset'
          ? 'Send reset link'
          : 'Send Magic Link'}
      </button>
    </form>
  )
}

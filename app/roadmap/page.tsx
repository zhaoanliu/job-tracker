import { Metadata } from 'next'
import Link from 'next/link'
import RoadmapFeedbackCta from './RoadmapFeedbackCta'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'Roadmap — Job Tracker',
  description: 'See what features are planned and recently shipped.',
}

interface GithubLabel {
  name: string
}

interface GithubIssue {
  number: number
  title: string
  html_url: string
  labels: GithubLabel[]
  state?: 'open' | 'closed'
  pull_request?: unknown
}

type StatusKey = 'in progress' | 'planned' | 'backlog' | 'triage'

const STATUS_MAP: Record<StatusKey, { label: string; className: string }> = {
  'in progress': { label: 'In progress', className: 'text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-300 dark:bg-blue-900/40 dark:border-blue-800' },
  'planned':     { label: 'Planned',     className: 'text-indigo-700 bg-indigo-50 border-indigo-200 dark:text-indigo-300 dark:bg-indigo-900/40 dark:border-indigo-800' },
  'backlog':     { label: 'Backlog',     className: 'text-slate-600 bg-slate-50 border-slate-200 dark:text-slate-400 dark:bg-slate-700 dark:border-slate-600' },
  'triage':      { label: 'Waiting for triage', className: 'text-yellow-700 bg-yellow-50 border-yellow-200 dark:text-yellow-300 dark:bg-yellow-900/40 dark:border-yellow-800' },
}

function getStatus(issue: GithubIssue): StatusKey {
  const names = issue.labels.map(l => l.name)
  if (issue.state !== 'closed' && names.includes('status: in progress')) return 'in progress'
  if (names.includes('status: planned')) return 'planned'
  if (names.includes('status: backlog')) return 'backlog'
  return 'triage'
}

function StatusBadge({ status }: { status: StatusKey }) {
  const { label, className } = STATUS_MAP[status]
  return (
    <span className={`text-xs font-medium border rounded-full px-2 py-0.5 shrink-0 ${className}`}>
      {label}
    </span>
  )
}

async function fetchIssues(state: 'open' | 'closed', label: string): Promise<GithubIssue[]> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/zhaoanliu/job-tracker/issues?labels=${label}&state=${state}&per_page=100`,
      { headers: { Accept: 'application/vnd.github+json' } }
    )
    if (!res.ok) return []
    const data: GithubIssue[] = await res.json()
    return data.filter(i => !i.pull_request)
  } catch {
    return []
  }
}

export default async function RoadmapPage() {
  const [pending, plannedIssues, shipped] = await Promise.all([
    fetchIssues('open', 'user-requested'),
    fetchIssues('open', 'planned'),
    fetchIssues('closed', 'user-requested'),
  ])

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 dark:from-slate-900 dark:to-slate-800 px-4 py-12">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors mb-6"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back to dashboard
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Roadmap</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Features requested by users. Sign in and use the Feedback button to suggest something new.
          </p>
        </div>

        <section className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-2 h-2 rounded-full bg-indigo-500" />
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Pending{pending.length > 0 ? ` (${pending.length})` : ''}
            </h2>
          </div>
          {pending.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500 pl-4">No features pending — be the first to suggest one!</p>
          ) : (
            <ul className="space-y-2">
              {pending.map(issue => (
                <li key={issue.number}>
                  <a
                    href={issue.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-sm transition-all"
                  >
                    <span className="flex-1 text-sm text-slate-800 dark:text-slate-200">{issue.title}</span>
                    <StatusBadge status={getStatus(issue)} />
                    <svg className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        {plannedIssues.length > 0 && (
          <section className="mb-10">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-2 h-2 rounded-full bg-purple-600" style={{ backgroundColor: '#8250df' }} />
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                Planned ({plannedIssues.length})
              </h2>
            </div>
            <ul className="space-y-2">
              {plannedIssues.map(issue => (
                <li key={issue.number}>
                  <a
                    href={issue.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 hover:border-purple-300 dark:hover:border-purple-600 hover:shadow-sm transition-all"
                  >
                    <span className="flex-1 text-sm text-slate-800 dark:text-slate-200">{issue.title}</span>
                    <span className="text-xs font-medium border rounded-full px-2 py-0.5 shrink-0 text-purple-700 bg-purple-50 border-purple-200 dark:text-purple-300 dark:bg-purple-900/40 dark:border-purple-800">
                      Planned
                    </span>
                    <svg className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {shipped.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Recently shipped</h2>
            </div>
            <ul className="space-y-2">
              {shipped.slice(0, 5).map(issue => (
                <li key={issue.number}>
                  <a
                    href={issue.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 opacity-60 hover:opacity-100 hover:border-green-300 dark:hover:border-green-700 hover:shadow-sm transition-all"
                  >
                    <span className="flex-1 text-sm text-slate-600 dark:text-slate-300">{issue.title}</span>
                    <span className="text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5 shrink-0 dark:text-green-300 dark:bg-green-900/40 dark:border-green-800">
                      Shipped
                    </span>
                    <svg className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-12 text-center">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Have an idea?{' '}
            <RoadmapFeedbackCta />
          </p>
        </div>
      </div>
    </main>
  )
}

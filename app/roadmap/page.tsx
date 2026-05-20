import { Metadata } from 'next'
import Link from 'next/link'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'Roadmap — Job Tracker',
  description: 'See what features are planned and recently shipped.',
}

interface GithubIssue {
  number: number
  title: string
  html_url: string
  pull_request?: unknown
}

async function fetchIssues(state: 'open' | 'closed'): Promise<GithubIssue[]> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/zhaoanliu/job-tracker/issues?labels=user-requested&state=${state}&per_page=100`,
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
  const [planned, shipped] = await Promise.all([
    fetchIssues('open'),
    fetchIssues('closed'),
  ])

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 px-4 py-12">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-600 transition-colors mb-6"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back to dashboard
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">Roadmap</h1>
          <p className="mt-1 text-sm text-slate-500">
            Features requested by users. Sign in and use the Feedback button to suggest something new.
          </p>
        </div>

        <section className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-2 h-2 rounded-full bg-indigo-500" />
            <h2 className="text-sm font-semibold text-slate-700">
              Planned{planned.length > 0 ? ` (${planned.length})` : ''}
            </h2>
          </div>
          {planned.length === 0 ? (
            <p className="text-sm text-slate-400 pl-4">No features planned yet — be the first to suggest one!</p>
          ) : (
            <ul className="space-y-2">
              {planned.map(issue => (
                <li key={issue.number}>
                  <a
                    href={issue.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 hover:border-indigo-300 hover:shadow-sm transition-all"
                  >
                    <span className="flex-1 text-sm text-slate-800">{issue.title}</span>
                    <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        {shipped.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <h2 className="text-sm font-semibold text-slate-700">Recently shipped</h2>
            </div>
            <ul className="space-y-2">
              {shipped.slice(0, 5).map(issue => (
                <li key={issue.number}>
                  <a
                    href={issue.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 opacity-60 hover:opacity-100 hover:border-green-300 hover:shadow-sm transition-all"
                  >
                    <span className="flex-1 text-sm text-slate-600">{issue.title}</span>
                    <span className="text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5 shrink-0">
                      Shipped
                    </span>
                    <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-12 text-center">
          <p className="text-xs text-slate-400">
            Have an idea?{' '}
            <Link href="/dashboard" className="text-indigo-600 hover:underline">
              Sign in to submit a request
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}

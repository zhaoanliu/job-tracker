import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// next/link renders a plain <a> in jsdom
vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}))

import RoadmapPage from '@/app/roadmap/page'

const makeIssue = (n: number, title: string) => ({
  number: n,
  title,
  html_url: `https://github.com/owner/repo/issues/${n}`,
})

function mockFetch(open: ReturnType<typeof makeIssue>[], closed: ReturnType<typeof makeIssue>[]) {
  let call = 0
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
    const data = call++ === 0 ? open : closed
    return Promise.resolve({ ok: true, json: async () => data })
  }))
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.unstubAllGlobals())

describe('RoadmapPage', () => {
  it('renders the page heading', async () => {
    mockFetch([], [])
    render(await RoadmapPage())
    expect(screen.getByRole('heading', { name: /Roadmap/i })).toBeInTheDocument()
  })

  it('shows a back-to-dashboard link', async () => {
    mockFetch([], [])
    render(await RoadmapPage())
    expect(screen.getByRole('link', { name: /Back to dashboard/i })).toHaveAttribute('href', '/dashboard')
  })

  it('shows the empty-state message when there are no planned features', async () => {
    mockFetch([], [])
    render(await RoadmapPage())
    expect(screen.getByText(/No features planned yet/i)).toBeInTheDocument()
  })

  it('renders planned features as links', async () => {
    mockFetch(
      [makeIssue(1, 'Dark mode'), makeIssue(2, 'CSV export v2')],
      []
    )
    render(await RoadmapPage())
    expect(screen.getByRole('link', { name: /Dark mode/i })).toHaveAttribute(
      'href',
      'https://github.com/owner/repo/issues/1'
    )
    expect(screen.getByRole('link', { name: /CSV export v2/i })).toBeInTheDocument()
  })

  it('shows planned count in section heading', async () => {
    mockFetch([makeIssue(1, 'Dark mode'), makeIssue(2, 'Notifications')], [])
    render(await RoadmapPage())
    expect(screen.getByText(/Planned \(2\)/i)).toBeInTheDocument()
  })

  it('renders the shipped section when closed issues exist', async () => {
    mockFetch([], [makeIssue(10, 'Magic link login')])
    render(await RoadmapPage())
    expect(screen.getByText(/Recently shipped/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Magic link login/i })).toBeInTheDocument()
    expect(screen.getByText('Shipped')).toBeInTheDocument()
  })

  it('omits the shipped section when no closed issues exist', async () => {
    mockFetch([makeIssue(1, 'Dark mode')], [])
    render(await RoadmapPage())
    expect(screen.queryByText(/Recently shipped/i)).not.toBeInTheDocument()
  })

  it('shows at most 5 shipped items', async () => {
    const closed = Array.from({ length: 10 }, (_, i) => makeIssue(i + 100, `Feature ${i + 1}`))
    mockFetch([], closed)
    render(await RoadmapPage())
    const shippedBadges = screen.getAllByText('Shipped')
    expect(shippedBadges).toHaveLength(5)
  })

  it('filters out pull requests from both sections', async () => {
    mockFetch(
      [{ ...makeIssue(1, 'Real issue'), pull_request: {} }, makeIssue(2, 'Kept issue')],
      []
    )
    render(await RoadmapPage())
    expect(screen.queryByText('Real issue')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Kept issue/i })).toBeInTheDocument()
  })

  it('renders gracefully when the GitHub API fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')))
    render(await RoadmapPage())
    expect(screen.getByText(/No features planned yet/i)).toBeInTheDocument()
    expect(screen.queryByText(/Recently shipped/i)).not.toBeInTheDocument()
  })

  it('renders gracefully when the GitHub API returns non-ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    render(await RoadmapPage())
    expect(screen.getByText(/No features planned yet/i)).toBeInTheDocument()
  })
})

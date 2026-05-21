import { createServiceClient } from '@/lib/supabase/service'
import MetricCard from '@/components/admin/MetricCard'
import SignupsChart from '@/components/admin/SignupsChart'
import StageChart from '@/components/admin/StageChart'
import EventsChart from '@/components/admin/EventsChart'

// Aggregate an array of ISO timestamps into { day, count }[] for the last N days.
function groupByDay(timestamps: string[], days = 30): { day: string; count: number }[] {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  cutoff.setHours(0, 0, 0, 0)

  const counts: Record<string, number> = {}
  for (const ts of timestamps) {
    const d = new Date(ts)
    if (d < cutoff) continue
    const key = d.toISOString().slice(0, 10)
    counts[key] = (counts[key] ?? 0) + 1
  }

  // Fill every calendar day so charts show zero gaps
  const result: { day: string; count: number }[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    result.push({ day: key, count: counts[key] ?? 0 })
  }
  return result
}

export default async function AdminPage() {
  const admin = createServiceClient()
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const cutoffIso = thirtyDaysAgo.toISOString()

  // ── Auth users (requires service role) ──────────────────────────────────
  const { data: usersPage } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const users = usersPage?.users ?? []
  const totalUsers = users.length
  const signupsPerDay = groupByDay(users.map(u => u.created_at))

  // ── Applications ─────────────────────────────────────────────────────────
  const [{ count: totalApplications }, { data: recentApps }, { data: allStatuses }] =
    await Promise.all([
      admin.from('applications').select('*', { count: 'exact', head: true }),
      admin.from('applications').select('created_at').gte('created_at', cutoffIso),
      admin.from('applications').select('status'),
    ])

  const applicationsPerDay = groupByDay((recentApps ?? []).map(a => a.created_at))

  const stageDistribution = Object.entries(
    (allStatuses ?? []).reduce<Record<string, number>>((acc, { status }) => {
      acc[status] = (acc[status] ?? 0) + 1
      return acc
    }, {})
  ).map(([stage, count]) => ({ stage, count }))

  // ── User activation ───────────────────────────────────────────────────────
  const { data: usersWithApps } = await admin.from('applications').select('user_id')
  const usersWithAnyApp = new Set((usersWithApps ?? []).map(a => a.user_id)).size
  const dropOffCount = totalUsers - usersWithAnyApp

  // ── Invites ───────────────────────────────────────────────────────────────
  const [{ count: totalInvites }, { data: inviterIds }] = await Promise.all([
    admin.from('invites').select('*', { count: 'exact', head: true }),
    admin.from('invites').select('sender_id'),
  ])
  const uniqueInviters = new Set((inviterIds ?? []).map(r => r.sender_id)).size

  // ── Behavioural events ────────────────────────────────────────────────────
  const { data: eventRows } = await admin
    .from('events')
    .select('event_name, created_at')
    .gte('created_at', cutoffIso)

  const eventNames = ['drag_drop', 'filter_applied', 'csv_import'] as const
  const eventsPerDay = (() => {
    const byDay: Record<string, Record<string, number>> = {}
    for (const row of eventRows ?? []) {
      const day = new Date(row.created_at).toISOString().slice(0, 10)
      byDay[day] ??= {}
      byDay[day][row.event_name] = (byDay[day][row.event_name] ?? 0) + 1
    }
    // Fill every calendar day
    const result = []
    for (let i = 29; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const day = d.toISOString().slice(0, 10)
      const entry: Record<string, string | number> = { day }
      for (const name of eventNames) entry[name] = byDay[day]?.[name] ?? 0
      result.push(entry)
    }
    return result
  })()

  const totalDragDrops = (eventRows ?? []).filter(e => e.event_name === 'drag_drop').length
  const totalFeedback = (eventRows ?? []).filter(e => e.event_name === 'feedback_submitted').length

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Last 30 days · live data</p>
        </div>

        {/* Top stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <MetricCard label="Total Users" value={totalUsers} />
          <MetricCard label="Total Applications" value={totalApplications ?? 0} />
          <MetricCard label="Invites Sent" value={totalInvites ?? 0} />
          <MetricCard label="Drag-drops (30d)" value={totalDragDrops} />
        </div>

        {/* Charts row 1 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Signups per day (30d)</h2>
            <SignupsChart data={signupsPerDay} color="#4f46e5" />
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Applications created (30d)</h2>
            <SignupsChart data={applicationsPerDay} color="#0891b2" />
          </div>
        </div>

        {/* Charts row 2 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Stage distribution (all time)</h2>
            <StageChart data={stageDistribution} />
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">User activation</h2>
            <div className="space-y-4 mt-2">
              <Stat label="Users with at least 1 application" value={usersWithAnyApp} total={totalUsers} />
              <Stat label="Signed up, never added an application" value={dropOffCount} total={totalUsers} accent="rose" />
              <Stat label="Users who sent at least 1 invite" value={uniqueInviters} total={totalUsers} />
              <Stat label="Feedback submissions (30d)" value={totalFeedback} />
            </div>
          </div>
        </div>

        {/* Feature usage chart */}
        <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Feature usage (30d)</h2>
          <EventsChart data={eventsPerDay} />
        </div>
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  total,
  accent = 'indigo',
}: {
  label: string
  value: number
  total?: number
  accent?: 'indigo' | 'rose'
}) {
  const pct = total ? Math.round((value / total) * 100) : null
  const barColor = accent === 'rose' ? 'bg-rose-400' : 'bg-indigo-500'
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-600">{label}</span>
        <span className="font-semibold text-gray-900">
          {value}
          {pct !== null && <span className="text-gray-400 font-normal ml-1">({pct}%)</span>}
        </span>
      </div>
      {pct !== null && (
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full ${barColor} rounded-full`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  )
}

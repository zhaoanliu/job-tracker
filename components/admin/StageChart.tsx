'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const STAGE_COLORS: Record<string, string> = {
  future: '#818cf8',
  applied: '#4f46e5',
  interview: '#0891b2',
  offer: '#059669',
  rejected: '#f43f5e',
  withdrawn: '#9ca3af',
}

interface Props {
  data: { stage: string; count: number }[]
}

export default function StageChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
        <XAxis
          dataKey="stage"
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
          formatter={(v) => [v, 'applications']}
        />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {data.map(entry => (
            <Cell key={entry.stage} fill={STAGE_COLORS[entry.stage] ?? '#818cf8'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

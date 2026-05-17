import { Application, ApplicationFormData } from './types'

const CSV_HEADERS = [
  'company', 'role', 'status', 'type', 'priority', 'location', 'workmode',
  'date', 'link', 'source', 'referrer', 'notes', 'next_step', 'jd', 'order',
] as const

function escapeCsvValue(value: unknown): string {
  if (value == null) return ''
  const str = String(value)
  // Quote if contains comma, newline, or double-quote
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function exportToCsv(applications: Application[]): string {
  const rows = [
    CSV_HEADERS.join(','),
    ...applications.map(app =>
      CSV_HEADERS.map(h => escapeCsvValue(app[h])).join(',')
    ),
  ]
  return rows.join('\n')
}

export function downloadCsv(applications: Application[]): void {
  const csv = exportToCsv(applications)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `job-applications-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function parseCsvRow(row: string): string[] {
  const values: string[] = []
  let current = ''
  let inQuotes = false
  let i = 0

  while (i < row.length) {
    const char = row[i]
    if (char === '"') {
      if (inQuotes && row[i + 1] === '"') {
        current += '"'
        i += 2
        continue
      }
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      values.push(current)
      current = ''
    } else {
      current += char
    }
    i++
  }
  values.push(current)
  return values
}

export function parseCsv(csvText: string): Partial<ApplicationFormData>[] {
  const lines = csvText.trim().split('\n')
  if (lines.length < 2) return []

  const headers = parseCsvRow(lines[0])
  const results: Partial<ApplicationFormData>[] = []

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const values = parseCsvRow(lines[i])
    const obj: Record<string, string> = {}
    headers.forEach((h, idx) => {
      obj[h.trim()] = values[idx]?.trim() ?? ''
    })
    results.push({
      company: obj.company || '',
      role: obj.role || null,
      // Cast loosely — validation happens at the DB / RLS layer
      status: (obj.status as ApplicationFormData['status']) || 'future',
      type: (obj.type as ApplicationFormData['type']) || null,
      priority: (obj.priority as ApplicationFormData['priority']) || 'Medium',
      location: (obj.location as ApplicationFormData['location']) || null,
      workmode: (obj.workmode as ApplicationFormData['workmode']) || 'Hybrid',
      date: obj.date || null,
      link: obj.link || null,
      source: (obj.source as ApplicationFormData['source']) || 'LinkedIn',
      referrer: obj.referrer || null,
      notes: obj.notes || null,
      next_step: obj.next_step || null,
      jd: obj.jd || null,
      order: obj.order ? parseInt(obj.order, 10) : 0,
    })
  }

  return results
}

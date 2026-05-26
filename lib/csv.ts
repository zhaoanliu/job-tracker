import { Application, ApplicationFormData, CsvHistoryEntry, ImportRow } from './types'

const APP_HEADERS = [
  'company', 'role', 'team', 'status', 'type', 'priority', 'location', 'workmode',
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

export function exportToCsv(
  applications: Application[],
  historyMap?: Map<string, CsvHistoryEntry[]>
): string {
  const headers = [...APP_HEADERS, 'status_history']
  const rows = [
    headers.join(','),
    ...applications.map(app => {
      const appValues = APP_HEADERS.map(h => escapeCsvValue(app[h]))
      const history = historyMap?.get(app.id) ?? []
      const historyValue = escapeCsvValue(history.length ? JSON.stringify(history) : '')
      return [...appValues, historyValue].join(',')
    }),
  ]
  return rows.join('\n')
}

export function downloadCsv(
  applications: Application[],
  historyMap?: Map<string, CsvHistoryEntry[]>
): void {
  const csv = exportToCsv(applications, historyMap)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `job-applications-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

// Parse entire CSV text into rows, handling quoted fields that span newlines.
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []
  let currentRow: string[] = []
  let current = ''
  let inQuotes = false
  let i = 0

  while (i < text.length) {
    const char = text[i]
    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"'
        i += 2
        continue
      }
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      currentRow.push(current)
      current = ''
    } else if (char === '\r') {
      // skip bare \r; \r\n handled when we hit the \n
    } else if (char === '\n' && !inQuotes) {
      currentRow.push(current)
      current = ''
      rows.push(currentRow)
      currentRow = []
    } else {
      current += char
    }
    i++
  }

  currentRow.push(current)
  if (currentRow.some(v => v !== '')) rows.push(currentRow)

  return rows
}

export function parseCsv(csvText: string): ImportRow[] {
  const rows = parseCsvRows(csvText.trim())
  if (rows.length < 2) return []

  const headers = rows[0].map(h => h.trim())
  const results: ImportRow[] = []

  for (let i = 1; i < rows.length; i++) {
    const values = rows[i]
    const obj: Record<string, string> = {}
    headers.forEach((h, idx) => {
      obj[h] = values[idx]?.trim() ?? ''
    })

    if (!obj.company) continue

    let _statusHistory: CsvHistoryEntry[] | undefined
    if (obj.status_history) {
      try {
        const parsed = JSON.parse(obj.status_history)
        if (Array.isArray(parsed)) {
          _statusHistory = parsed.filter(
            (e): e is CsvHistoryEntry =>
              typeof e?.status === 'string' && typeof e?.changed_at === 'string'
          )
          if (_statusHistory.length === 0) _statusHistory = undefined
        }
      } catch {
        // ignore malformed JSON — backward compat
      }
    }

    results.push({
      company: obj.company,
      role: obj.role || null,
      team: obj.team || null,
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
      _statusHistory,
    })
  }

  return results
}

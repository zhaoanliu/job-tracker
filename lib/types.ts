export type ApplicationStatus =
  | 'future'
  | 'watchlist'
  | 'referred'
  | 'applied'
  | 'hr'
  | 'hm'
  | 'interview'
  | 'offer'
  | 'closed'

export type ApplicationType =
  | 'Principal Engineer'
  | 'Security Engineer'
  | 'Security Architect'
  | 'Other'

export type ApplicationPriority = 'High' | 'Medium' | 'Low'

export type ApplicationLocation =
  | 'Bellevue WA'
  | 'Seattle WA'
  | 'Redmond WA'
  | 'Remote'

export type ApplicationWorkmode = 'On-site' | 'Hybrid' | 'Remote'

export type ApplicationSource = 'LinkedIn' | 'Company website' | 'Other'

export interface Application {
  id: string
  user_id: string
  company: string
  role: string | null
  status: ApplicationStatus
  type: ApplicationType | null
  priority: ApplicationPriority
  location: ApplicationLocation | null
  workmode: ApplicationWorkmode
  date: string | null
  link: string | null
  source: ApplicationSource
  referrer: string | null
  notes: string | null
  next_step: string | null
  jd: string | null
  order: number
  created_at: string
  updated_at: string
}

export type ApplicationFormData = Omit<Application, 'id' | 'user_id' | 'created_at' | 'updated_at'>

export interface Stage {
  id: ApplicationStatus
  label: string
  colorClass: string
  headerClass: string
  dotClass: string
}

export const STAGES: Stage[] = [
  {
    id: 'future',
    label: 'Future',
    colorClass: 'bg-slate-50 border-slate-200',
    headerClass: 'text-slate-600 bg-slate-100',
    dotClass: 'bg-slate-400',
  },
  {
    id: 'watchlist',
    label: 'Waiting to Apply',
    colorClass: 'bg-sky-50 border-sky-200',
    headerClass: 'text-sky-700 bg-sky-100',
    dotClass: 'bg-sky-400',
  },
  {
    id: 'referred',
    label: 'Referred',
    colorClass: 'bg-purple-50 border-purple-200',
    headerClass: 'text-purple-700 bg-purple-100',
    dotClass: 'bg-purple-400',
  },
  {
    id: 'applied',
    label: 'Applied',
    colorClass: 'bg-indigo-50 border-indigo-200',
    headerClass: 'text-indigo-700 bg-indigo-100',
    dotClass: 'bg-indigo-400',
  },
  {
    id: 'hr',
    label: 'Chat w/ HR',
    colorClass: 'bg-cyan-50 border-cyan-200',
    headerClass: 'text-cyan-700 bg-cyan-100',
    dotClass: 'bg-cyan-400',
  },
  {
    id: 'hm',
    label: 'Chat w/ HM',
    colorClass: 'bg-teal-50 border-teal-200',
    headerClass: 'text-teal-700 bg-teal-100',
    dotClass: 'bg-teal-400',
  },
  {
    id: 'interview',
    label: 'Interviewing',
    colorClass: 'bg-amber-50 border-amber-200',
    headerClass: 'text-amber-700 bg-amber-100',
    dotClass: 'bg-amber-400',
  },
  {
    id: 'offer',
    label: 'Offer',
    colorClass: 'bg-emerald-50 border-emerald-200',
    headerClass: 'text-emerald-700 bg-emerald-100',
    dotClass: 'bg-emerald-400',
  },
  {
    id: 'closed',
    label: 'Closed',
    colorClass: 'bg-rose-50 border-rose-200',
    headerClass: 'text-rose-700 bg-rose-100',
    dotClass: 'bg-rose-400',
  },
]

export const STAGE_MAP = Object.fromEntries(STAGES.map(s => [s.id, s])) as Record<ApplicationStatus, Stage>

export interface Filters {
  priority: ApplicationPriority[]
  type: ApplicationType[]
  workmode: ApplicationWorkmode[]
  location: ApplicationLocation[]
  search: string
}

export type SortField = 'order' | 'date' | 'company' | 'priority'

export interface StatusHistoryEntry {
  id: string
  application_id: string
  status: ApplicationStatus
  changed_at: string
}

export interface CsvHistoryEntry {
  status: string
  changed_at: string
}

export type ImportRow = Partial<ApplicationFormData> & { _statusHistory?: CsvHistoryEntry[] }

export const PRIORITY_RANK: Record<ApplicationPriority, number> = {
  High: 0,
  Medium: 1,
  Low: 2,
}

export const APPLICATION_TYPES: ApplicationType[] = [
  'Principal Engineer',
  'Security Engineer',
  'Security Architect',
  'Other',
]

export const APPLICATION_PRIORITIES: ApplicationPriority[] = ['High', 'Medium', 'Low']

export const APPLICATION_LOCATIONS: ApplicationLocation[] = [
  'Bellevue WA',
  'Seattle WA',
  'Redmond WA',
  'Remote',
]

export const APPLICATION_WORKMODES: ApplicationWorkmode[] = ['On-site', 'Hybrid', 'Remote']

export const APPLICATION_SOURCES: ApplicationSource[] = [
  'LinkedIn',
  'Company website',
  'Other',
]

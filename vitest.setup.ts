import '@testing-library/jest-dom'
import { vi } from 'vitest'

// jsdom v29 no longer provides a functional localStorage — stub it globally
// so tests can call clear/getItem/setItem without TypeError.
const _localStore: Record<string, string> = {}
const localStorageMock: Storage = {
  getItem: (k: string) => _localStore[k] ?? null,
  setItem: (k: string, v: string) => { _localStore[k] = v },
  removeItem: (k: string) => { delete _localStore[k] },
  clear: () => { Object.keys(_localStore).forEach(k => delete _localStore[k]) },
  get length() { return Object.keys(_localStore).length },
  key: (n: number) => Object.keys(_localStore)[n] ?? null,
}
Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true })

// Next.js navigation — components under test don't need real routing
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  redirect: vi.fn(),
}))

// next/font cannot run in jsdom
vi.mock('next/font/google', () => ({
  Inter: () => ({ className: 'mock-inter' }),
}))

// Supabase browser client — swap with a typed spy so tests control responses
vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-uid' } } }),
      signOut: vi.fn().mockResolvedValue({}),
      signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
      signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
      signUp: vi.fn().mockResolvedValue({ error: null }),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: vi.fn((resolve: (v: { data: unknown[]; error: null }) => void) =>
        resolve({ data: [], error: null })
      ),
    })),
  })),
}))

// @dnd-kit hooks can't run without a real DOM drag context
vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
  SortableContext: ({ children }: { children: React.ReactNode }) => children,
  verticalListSortingStrategy: {},
  sortableKeyboardCoordinates: vi.fn(),
  arrayMove: <T,>(arr: T[], from: number, to: number): T[] => {
    const next = arr.slice()
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    return next
  },
}))

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => '' } },
}))

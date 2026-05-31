import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

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
  sortableKeyboardCoordinates: () => ({ x: 0, y: 0 }),
  arrayMove: <T,>(arr: T[]) => arr,
}))

import KanbanBoard from '@/components/board/KanbanBoard'

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('KanbanBoard — acceptance criteria for issue #483', () => {
  it('renders a column labeled "Future" on the board', () => {
    render(<KanbanBoard initialApplications={[]} userEmail="demo@jobtracker.dev" />)
    expect(screen.getByRole('heading', { name: 'Future' })).toBeInTheDocument()
  })

  it('renders a column labeled "Applied" on the board', () => {
    render(<KanbanBoard initialApplications={[]} userEmail="demo@jobtracker.dev" />)
    expect(screen.getByRole('heading', { name: 'Applied' })).toBeInTheDocument()
  })

  it('opens the application modal with a Company input when "Add to Future" is clicked', async () => {
    render(<KanbanBoard initialApplications={[]} userEmail="demo@jobtracker.dev" />)
    await userEvent.click(screen.getByTitle('Add to Future'))
    expect(await screen.findByText('New Application')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('e.g. Acme Corp')).toBeInTheDocument()
  })
})

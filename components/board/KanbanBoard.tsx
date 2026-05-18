'use client'

import { useState, useCallback } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  UniqueIdentifier,
} from '@dnd-kit/core'
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import {
  Application,
  ApplicationStatus,
  Filters,
  STAGES,
  SortField,
} from '@/lib/types'
import { getStageApplications } from '@/lib/utils'
import KanbanColumn from './KanbanColumn'
import DragOverlayCard from './DragOverlayCard'
import ApplicationModal from '@/components/modals/ApplicationModal'
import Navbar from '@/components/ui/Navbar'
import StatsBar from '@/components/ui/StatsBar'
import FilterBar from '@/components/ui/FilterBar'
import { createClient } from '@/lib/supabase/client'

interface KanbanBoardProps {
  initialApplications: Application[]
  userEmail: string
}

export default function KanbanBoard({ initialApplications, userEmail }: KanbanBoardProps) {
  const supabase = createClient()

  const [applications, setApplications] = useState<Application[]>(initialApplications)
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null)
  const [filters, setFilters] = useState<Filters>({ priority: [], type: [], workmode: [], location: [] })
  const [sortBy, setSortBy] = useState<SortField>('order')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingApp, setEditingApp] = useState<Application | null>(null)
  const [defaultStatus, setDefaultStatus] = useState<ApplicationStatus>('future')

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const activeApp = activeId ? applications.find(a => a.id === activeId) ?? null : null

  // Resolve where a dragged item is heading: returns target stage id
  function resolveTargetStatus(overId: UniqueIdentifier): ApplicationStatus | null {
    if (STAGES.some(s => s.id === overId)) return overId as ApplicationStatus
    return applications.find(a => a.id === overId)?.status ?? null
  }

  function handleDragStart({ active }: DragStartEvent) {
    setActiveId(active.id)
  }

  // Live preview: when dragging a card over a different column, move it there
  // immediately in local state so the column card counts update in real time.
  function handleDragOver({ active, over }: DragOverEvent) {
    if (!over) return
    const card = applications.find(a => a.id === active.id)
    if (!card) return

    const targetStatus = resolveTargetStatus(over.id)
    if (!targetStatus || targetStatus === card.status) return

    setApplications(prev => {
      const filtered = prev.filter(a => a.id !== active.id)
      const targetCards = filtered.filter(a => a.status === targetStatus)
      const overIsCard = !STAGES.some(s => s.id === over.id)
      const overIdx = overIsCard ? targetCards.findIndex(a => a.id === over.id) : targetCards.length
      const insertAt = overIdx >= 0 ? overIdx : targetCards.length

      const newCard = { ...card, status: targetStatus, order: insertAt }
      const withNew = [
        ...filtered.filter(a => a.status !== targetStatus),
        ...targetCards.slice(0, insertAt),
        newCard,
        ...targetCards.slice(insertAt),
      ].map((a, _, arr) => {
        // Recompute order within each column
        const colCards = arr.filter(x => x.status === a.status)
        return { ...a, order: colCards.indexOf(a) }
      })
      return withNew
    })
  }

  async function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null)
    if (!over || active.id === over.id) return

    const card = applications.find(a => a.id === active.id)
    if (!card) return

    const overIsColumn = STAGES.some(s => s.id === over.id)
    const targetStatus = resolveTargetStatus(over.id)
    if (!targetStatus) return

    if (card.status === targetStatus && !overIsColumn) {
      // Same-column reorder
      const colCards = applications.filter(a => a.status === targetStatus)
      const oldIdx = colCards.findIndex(a => a.id === active.id)
      const newIdx = colCards.findIndex(a => a.id === over.id)
      if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) return

      const reordered = arrayMove(colCards, oldIdx, newIdx).map((a, i) => ({ ...a, order: i }))

      setApplications(prev => [
        ...prev.filter(a => a.status !== targetStatus),
        ...reordered,
      ])

      // Persist reordered sequence
      const results = await Promise.all(
        reordered.map(a =>
          supabase
            .from('applications')
            .update({ order: a.order, updated_at: new Date().toISOString() })
            .eq('id', a.id)
        )
      )
      results.forEach(({ error }) => { if (error) console.error(error) })
    } else {
      // Cross-column move: state was already updated optimistically in handleDragOver.
      // Just persist the new status and order to the DB.
      const updatedCard = applications.find(a => a.id === active.id)
      if (!updatedCard) return

      const { error } = await supabase
        .from('applications')
        .update({
          status: updatedCard.status,
          order: updatedCard.order,
          updated_at: new Date().toISOString(),
        })
        .eq('id', active.id)
      if (error) console.error(error)
    }
  }

  // ── CRUD handlers ────────────────────────────────────────────────

  const openNew = useCallback((stageId?: string) => {
    setEditingApp(null)
    setDefaultStatus((stageId as ApplicationStatus) ?? 'future')
    setModalOpen(true)
  }, [])

  const openEdit = useCallback((app: Application) => {
    setEditingApp(app)
    setModalOpen(true)
  }, [])

  async function handleSave(data: Partial<Application>) {
    if (editingApp) {
      // Update
      const updated = { ...data, updated_at: new Date().toISOString() }
      setApplications(prev => prev.map(a => a.id === editingApp.id ? { ...a, ...updated } : a))

      const { error } = await supabase
        .from('applications')
        .update(updated)
        .eq('id', editingApp.id)

      if (error) {
        // Revert on error
        setApplications(prev => prev.map(a => a.id === editingApp.id ? editingApp : a))
        throw error
      }
    } else {
      // Insert
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const colCards = applications.filter(a => a.status === (data.status ?? 'future'))
      const newApp = {
        ...data,
        role: data.role?.trim() ?? null,
        referrer: (data.referrer as string).toUpperCase(),
        user_id: user.id,
        order: colCards.length,
      }

      const { data: inserted, error } = await supabase
        .from('applications')
        .insert(newApp)
        .select()
        .single()

      if (error) throw error
      setApplications(prev => [...prev, inserted as Application])
    }
    setModalOpen(false)
  }

  async function handleDelete(id: string) {
    setApplications(prev => prev.filter(a => a.id !== id))
    const { error } = await supabase.from('applications').delete().eq('id', id)
    if (error) {
      // Restore on error
      const app = applications.find(a => a.id === id)
      if (app) setApplications(prev => [...prev, app])
      throw error
    }
    setModalOpen(false)
  }

  // Import: upsert rows parsed from CSV
  async function handleImport(rows: Partial<Application>[]) {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const inserts = rows
      .filter(r => r.company)
      .map((r, i) => ({ ...r, user_id: user.id, order: applications.length + i }))

    const { data: inserted, error } = await supabase
      .from('applications')
      .insert(inserts)
      .select()

    if (error) {
      console.error('CSV import failed:', error)
      return
    }
    if (inserted) setApplications(prev => [...prev, ...(inserted as Application[])])
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Navbar
        userEmail={userEmail}
        applications={applications}
        onImport={handleImport}
        onNewApplication={() => openNew()}
      />
      <StatsBar applications={applications} />
      <FilterBar
        filters={filters}
        sortBy={sortBy}
        onFilterChange={setFilters}
        onSortChange={setSortBy}
      />

      {/* Board */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          <div className="flex gap-3 p-4 h-full" style={{ minWidth: 'max-content' }}>
            {STAGES.map(stage => (
              <KanbanColumn
                key={stage.id}
                stage={stage}
                applications={getStageApplications(applications, stage.id, filters, sortBy)}
                onCardClick={openEdit}
                onAddClick={openNew}
              />
            ))}
          </div>
        </div>

        <DragOverlay>
          {activeApp ? <DragOverlayCard application={activeApp} /> : null}
        </DragOverlay>
      </DndContext>

      {modalOpen && (
        <ApplicationModal
          application={editingApp}
          defaultStatus={defaultStatus}
          onSave={handleSave}
          onDelete={editingApp ? () => handleDelete(editingApp.id) : undefined}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  )
}

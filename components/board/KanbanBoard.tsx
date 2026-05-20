'use client'

import { useState, useCallback, useRef } from 'react'
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
  ImportRow,
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
import { trackEvent } from '@/lib/trackEvent'

interface KanbanBoardProps {
  initialApplications: Application[]
  userEmail: string
}

export default function KanbanBoard({ initialApplications, userEmail }: KanbanBoardProps) {
  const supabase = createClient()

  const [applications, setApplications] = useState<Application[]>(initialApplications)
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null)
  const dragStartStatus = useRef<ApplicationStatus | null>(null)
  // Tracks the column the card was last dragged INTO (set inside setApplications so it uses
  // fresh prev state, not a stale closure). handleDragEnd uses this instead of over.id so
  // that releasing the mouse while the cursor clips a different column doesn't mismatch.
  const dragCurrentStatus = useRef<ApplicationStatus | null>(null)
  // Tracks the status actually persisted to DB per application id.
  // Used by handleSave to detect real status changes even when local state is ahead of DB.
  const persistedStatus = useRef<Map<string, ApplicationStatus>>(
    new Map(initialApplications.map(a => [a.id, a.status]))
  )
  const [filters, setFilters] = useState<Filters>({ priority: [], type: [], workmode: [], location: [], search: '' })
  const [sortBy, setSortBy] = useState<SortField>('order')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingApp, setEditingApp] = useState<Application | null>(null)
  const [defaultStatus, setDefaultStatus] = useState<ApplicationStatus>('future')

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const activeApp = activeId ? applications.find(a => a.id === activeId) ?? null : null

  function handleDragStart({ active }: DragStartEvent) {
    setActiveId(active.id)
    const card = applications.find(a => a.id === active.id)
    dragStartStatus.current = card?.status ?? null
    dragCurrentStatus.current = card?.status ?? null
  }

  // Live preview: all logic is inside the functional updater so it always reads
  // fresh state (prev) — no stale-closure issues. dragCurrentStatus is set here
  // so handleDragEnd knows the last column the card was dragged into.
  function handleDragOver({ active, over }: DragOverEvent) {
    if (!over) return
    setApplications(prev => {
      const card = prev.find(a => a.id === active.id)
      if (!card) return prev

      const targetStatus: ApplicationStatus | null = STAGES.some(s => s.id === over.id)
        ? (over.id as ApplicationStatus)
        : (prev.find(a => a.id === over.id)?.status ?? null)

      if (!targetStatus || card.status === targetStatus) return prev

      dragCurrentStatus.current = targetStatus

      const filtered = prev.filter(a => a.id !== active.id)
      const targetCards = filtered.filter(a => a.status === targetStatus)
      const overIsCard = !STAGES.some(s => s.id === over.id)
      const overIdx = overIsCard ? targetCards.findIndex(a => a.id === over.id) : targetCards.length
      const insertAt = overIdx >= 0 ? overIdx : targetCards.length
      const newCard = { ...card, status: targetStatus, order: insertAt }
      return [
        ...filtered.filter(a => a.status !== targetStatus),
        ...targetCards.slice(0, insertAt),
        newCard,
        ...targetCards.slice(insertAt),
      ].map((a, _, arr) => {
        const col = arr.filter(x => x.status === a.status)
        return { ...a, order: col.indexOf(a) }
      })
    })
  }

  async function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null)
    if (!over) return

    // Use the last column the card was dragged INTO (not over.id / cursor position at drop).
    // This prevents the bug where releasing the mouse while the cursor clips the source
    // column causes handleDragEnd to see a different target than handleDragOver set.
    const finalStatus = dragCurrentStatus.current
    if (!finalStatus) return

    if (finalStatus !== dragStartStatus.current) {
      // Cross-column: handleDragOver already moved the card in local state.
      // Compute order from the closure (card is excluded either way, so count is reliable).
      const finalOrder = applications.filter(
        a => a.status === finalStatus && a.id !== active.id
      ).length

      // Guard: if handleDragOver's update wasn't committed yet, move the card now.
      setApplications(prev => {
        const card = prev.find(a => a.id === active.id)
        if (!card || card.status === finalStatus) return prev
        const filtered = prev.filter(a => a.id !== active.id)
        const targetCards = filtered.filter(a => a.status === finalStatus)
        const newCard = { ...card, status: finalStatus, order: targetCards.length }
        return [...filtered, newCard].map((a, _, arr) => {
          const col = arr.filter(x => x.status === a.status)
          return { ...a, order: col.indexOf(a) }
        })
      })

      const { error } = await supabase
        .from('applications')
        .update({ status: finalStatus, order: finalOrder, updated_at: new Date().toISOString() })
        .eq('id', active.id)
      if (error) console.error('Cross-column move update failed:', error)
      else {
        persistedStatus.current.set(String(active.id), finalStatus)
        trackEvent('drag_drop', { from: dragStartStatus.current, to: finalStatus })
        const { data: { user } } = await supabase.auth.getUser()
        if (user) recordStatusHistory(String(active.id), user.id, finalStatus)
      }
    } else if (active.id !== over.id) {
      // Same-column reorder
      const colCards = applications.filter(a => a.status === finalStatus)
      const oldIdx = colCards.findIndex(a => a.id === active.id)
      const newIdx = colCards.findIndex(a => a.id === over.id)
      if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) return

      const reordered = arrayMove(colCards, oldIdx, newIdx).map((a, i) => ({ ...a, order: i }))
      setApplications(prev => [
        ...prev.filter(a => a.status !== finalStatus),
        ...reordered,
      ])

      const results = await Promise.all(
        reordered.map(a =>
          supabase
            .from('applications')
            .update({ order: a.order, updated_at: new Date().toISOString() })
            .eq('id', a.id)
        )
      )
      results.forEach(({ error }) => { if (error) console.error('Reorder update failed:', error) })
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

  async function recordStatusHistory(applicationId: string, userId: string, status: string, changedAt?: string) {
    const payload: Record<string, string> = { application_id: applicationId, user_id: userId, status }
    if (changedAt) payload.changed_at = changedAt
    const { error } = await supabase.from('status_history').insert(payload)
    if (error && error.code !== 'PGRST205') console.error('status_history insert failed:', error.message, error)
  }

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
        setApplications(prev => prev.map(a => a.id === editingApp.id ? editingApp : a))
        throw error
      }

      // Compare against persistedStatus (DB truth), not editingApp.status (local state),
      // so a drag-then-modal-save flow still records history even when local state is ahead.
      if (data.status && data.status !== persistedStatus.current.get(editingApp.id)) {
        persistedStatus.current.set(editingApp.id, data.status)
        const { data: { user } } = await supabase.auth.getUser()
        if (user) recordStatusHistory(editingApp.id, user.id, data.status)
      }
    } else {
      // Insert
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const colCards = applications.filter(a => a.status === (data.status ?? 'future'))
      const trimmedReferrer = data.referrer?.trim() ?? null
      const newApp = {
        ...data,
        role: data.role?.trim() ?? null,
        referrer: trimmedReferrer ? trimmedReferrer.toUpperCase() : null,
        location: data.location ?? null,
        user_id: user.id,
        order: colCards.length,
      }

      const { data: inserted, error } = await supabase
        .from('applications')
        .insert(newApp)
        .select()
        .single()

      if (error) throw error
      const insertedApp = inserted as Application
      persistedStatus.current.set(insertedApp.id, insertedApp.status)
      setApplications(prev => [...prev, insertedApp])
      recordStatusHistory(insertedApp.id, user.id, insertedApp.status)
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

  // Import: insert rows parsed from CSV, preserving status_history timestamps when present
  async function handleImport(rows: ImportRow[]) {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const validRows = rows.filter(r => r.company)
    const inserts = validRows.map((r, i) => {
      const { _statusHistory, ...appFields } = r
      void _statusHistory
      return { ...appFields, user_id: user.id, order: applications.length + i }
    })

    const { data: inserted, error } = await supabase
      .from('applications')
      .insert(inserts)
      .select()

    if (error) {
      console.error('CSV import failed:', error)
      return
    }
    if (inserted) {
      const apps = inserted as Application[]
      apps.forEach(a => persistedStatus.current.set(a.id, a.status))
      setApplications(prev => [...prev, ...apps])
      trackEvent('csv_import', { count: apps.length })
      // Supabase returns inserted rows in insertion order, so apps[i] matches validRows[i]
      await Promise.all(apps.map((app, i) => {
        const history = validRows[i]?._statusHistory
        if (history?.length) {
          return Promise.all(
            history.map(e => recordStatusHistory(app.id, user.id, e.status, e.changed_at))
          )
        }
        return recordStatusHistory(app.id, user.id, app.status)
      }))
    }
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
        onFilterChange={(f) => {
          setFilters(f)
          const active = f.priority.length + f.type.length + f.workmode.length + f.location.length + (f.search ? 1 : 0)
          if (active > 0) trackEvent('filter_applied')
        }}
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

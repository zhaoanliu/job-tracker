import { Application } from '@/lib/types'
import KanbanCard from './KanbanCard'

interface DragOverlayCardProps {
  application: Application
}

export default function DragOverlayCard({ application }: DragOverlayCardProps) {
  return (
    <KanbanCard
      application={application}
      onClick={() => {}}
      isDragOverlay
    />
  )
}

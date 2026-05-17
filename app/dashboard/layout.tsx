// Dashboard layout is intentionally minimal.
// Navbar and chrome are rendered inside KanbanBoard (client component)
// so they can access auth state and trigger actions without prop-drilling.
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

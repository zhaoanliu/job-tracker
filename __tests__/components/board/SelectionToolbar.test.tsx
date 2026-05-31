import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SelectionToolbar from '@/components/board/SelectionToolbar'

describe('SelectionToolbar', () => {
  it('renders nothing when count is 0', () => {
    const { container } = render(
      <SelectionToolbar count={0} onArchive={vi.fn()} onClear={vi.fn()} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the selection count when count > 0', () => {
    render(<SelectionToolbar count={3} onArchive={vi.fn()} onClear={vi.fn()} />)
    expect(screen.getByText('3 selected')).toBeInTheDocument()
  })

  it('renders Archive selected and Clear buttons with aria-labels', () => {
    render(<SelectionToolbar count={1} onArchive={vi.fn()} onClear={vi.fn()} />)
    expect(
      screen.getByRole('button', { name: 'Archive selected applications' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Clear selection' })
    ).toBeInTheDocument()
  })

  it('calls onArchive when Archive selected is clicked', async () => {
    const user = userEvent.setup()
    const onArchive = vi.fn()
    render(<SelectionToolbar count={2} onArchive={onArchive} onClear={vi.fn()} />)
    await user.click(
      screen.getByRole('button', { name: 'Archive selected applications' })
    )
    expect(onArchive).toHaveBeenCalledTimes(1)
  })

  it('calls onClear when Clear is clicked', async () => {
    const user = userEvent.setup()
    const onClear = vi.fn()
    render(<SelectionToolbar count={2} onArchive={vi.fn()} onClear={onClear} />)
    await user.click(screen.getByRole('button', { name: 'Clear selection' }))
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('disables Archive button while isArchiving is true', () => {
    render(
      <SelectionToolbar
        count={2}
        onArchive={vi.fn()}
        onClear={vi.fn()}
        isArchiving
      />
    )
    const archiveBtn = screen.getByRole('button', {
      name: 'Archive selected applications',
    })
    expect(archiveBtn).toBeDisabled()
  })

  it('does not disable Archive button when isArchiving is false or omitted', () => {
    render(<SelectionToolbar count={2} onArchive={vi.fn()} onClear={vi.fn()} />)
    expect(
      screen.getByRole('button', { name: 'Archive selected applications' })
    ).toBeEnabled()
  })

  it('does not call onArchive when Archive button is disabled', async () => {
    const user = userEvent.setup()
    const onArchive = vi.fn()
    render(
      <SelectionToolbar
        count={1}
        onArchive={onArchive}
        onClear={vi.fn()}
        isArchiving
      />
    )
    await user.click(
      screen.getByRole('button', { name: 'Archive selected applications' })
    )
    expect(onArchive).not.toHaveBeenCalled()
  })

  it('exposes a toolbar role with accessible name', () => {
    render(<SelectionToolbar count={1} onArchive={vi.fn()} onClear={vi.fn()} />)
    expect(
      screen.getByRole('toolbar', { name: 'Bulk selection actions' })
    ).toBeInTheDocument()
  })
})

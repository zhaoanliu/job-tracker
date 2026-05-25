import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ApplicationModal from '@/components/modals/ApplicationModal'
import { Application } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'

const existingApp: Application = {
  id: 'app-1',
  user_id: 'user-1',
  company: 'Acme Corp',
  role: 'Principal Engineer',
  status: 'applied',
  type: 'Principal Engineer',
  priority: 'High',
  location: 'Seattle WA',
  workmode: 'Hybrid',
  date: '2026-05-01',
  link: 'https://example.com',
  source: 'LinkedIn',
  referrer: 'Jane Doe',
  notes: 'Great culture',
  next_step: 'Follow up',
  jd: null,
  order: 0,
  created_at: '2026-05-01T00:00:00Z',
  updated_at: '2026-05-01T00:00:00Z',
}

const defaultProps = {
  application: null,
  defaultStatus: 'future' as const,
  onSave: vi.fn().mockResolvedValue(undefined),
  onDelete: undefined,
  onClose: vi.fn(),
}

describe('ApplicationModal — new application', () => {
  it('renders "New Application" title', () => {
    render(<ApplicationModal {...defaultProps} />)
    expect(screen.getByText('New Application')).toBeInTheDocument()
  })

  it('shows Add Application submit button', () => {
    render(<ApplicationModal {...defaultProps} />)
    expect(screen.getByRole('button', { name: 'Add Application' })).toBeInTheDocument()
  })

  it('calls onClose when Cancel is clicked', async () => {
    const onClose = vi.fn()
    render(<ApplicationModal {...defaultProps} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows a validation error when company is empty on submit', async () => {
    render(<ApplicationModal {...defaultProps} onSave={vi.fn()} />)
    // Use fireEvent.submit to bypass the HTML5 required constraint in JSDOM
    // so the JS handleSubmit runs and sets the error state.
    fireEvent.submit(document.querySelector('form')!)
    expect(await screen.findByText('Company is required')).toBeInTheDocument()
  })

  it('calls onSave with form data when company is filled in', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<ApplicationModal {...defaultProps} onSave={onSave} />)
    await userEvent.type(screen.getByPlaceholderText('e.g. Acme Corp'), 'New Co')
    await userEvent.click(screen.getByRole('button', { name: 'Add Application' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ company: 'New Co', status: 'future' })
    ))
  })

  it('shows error message when onSave throws', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('Save failed'))
    render(<ApplicationModal {...defaultProps} onSave={onSave} />)
    await userEvent.type(screen.getByPlaceholderText('e.g. Acme Corp'), 'New Co')
    fireEvent.submit(document.querySelector('form')!)
    expect(await screen.findByText('Save failed')).toBeInTheDocument()
  })

  it('defaults status to the provided defaultStatus', () => {
    render(<ApplicationModal {...defaultProps} defaultStatus="watchlist" />)
    const select = screen.getByDisplayValue('Waiting to Apply')
    expect(select).toBeInTheDocument()
  })

  describe('default date', () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      vi.setSystemTime(new Date(2026, 4, 22, 10, 0, 0))
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it("pre-fills the Date field with today's local date", () => {
      render(<ApplicationModal {...defaultProps} />)
      const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement
      expect(dateInput.value).toBe('2026-05-22')
    })

    it("submits today's date when the user doesn't change it", async () => {
      const onSave = vi.fn().mockResolvedValue(undefined)
      render(<ApplicationModal {...defaultProps} onSave={onSave} />)
      fireEvent.change(screen.getByPlaceholderText('e.g. Acme Corp'), { target: { value: 'New Co' } })
      fireEvent.submit(document.querySelector('form')!)
      await waitFor(() => expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ company: 'New Co', date: '2026-05-22' })
      ))
    })

    it('does not override the date when editing an existing application', () => {
      render(<ApplicationModal {...defaultProps} application={existingApp} />)
      const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement
      expect(dateInput.value).toBe('2026-05-01')
    })
  })
})

describe('ApplicationModal — edit application', () => {
  it('renders "Edit Application" title', () => {
    render(<ApplicationModal {...defaultProps} application={existingApp} />)
    expect(screen.getByText('Edit Application')).toBeInTheDocument()
  })

  it('pre-fills company field with existing value', () => {
    render(<ApplicationModal {...defaultProps} application={existingApp} />)
    expect(screen.getByDisplayValue('Acme Corp')).toBeInTheDocument()
  })

  it('shows Save Changes button', () => {
    render(<ApplicationModal {...defaultProps} application={existingApp} />)
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeInTheDocument()
  })

  it('shows delete button when onDelete is provided', () => {
    render(
      <ApplicationModal
        {...defaultProps}
        application={existingApp}
        onDelete={vi.fn().mockResolvedValue(undefined)}
      />
    )
    expect(screen.getByText('Delete application')).toBeInTheDocument()
  })

  it('requires confirmation before deleting', async () => {
    const onDelete = vi.fn()
    render(
      <ApplicationModal
        {...defaultProps}
        application={existingApp}
        onDelete={onDelete}
      />
    )
    await userEvent.click(screen.getByText('Delete application'))
    expect(screen.getByText('Are you sure?')).toBeInTheDocument()
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('calls onDelete after confirmation', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined)
    render(
      <ApplicationModal
        {...defaultProps}
        application={existingApp}
        onDelete={onDelete}
      />
    )
    await userEvent.click(screen.getByText('Delete application'))
    await userEvent.click(screen.getByText('Confirm Delete'))
    await waitFor(() => expect(onDelete).toHaveBeenCalled())
  })

  it('shows error message when onDelete throws', async () => {
    const onDelete = vi.fn().mockRejectedValue(new Error('Delete failed'))
    render(
      <ApplicationModal
        {...defaultProps}
        application={existingApp}
        onDelete={onDelete}
      />
    )
    await userEvent.click(screen.getByText('Delete application'))
    await userEvent.click(screen.getByText('Confirm Delete'))
    expect(await screen.findByText('Delete failed')).toBeInTheDocument()
  })
})

describe('ApplicationModal — History tab', () => {
  it('renders History tab button', () => {
    render(<ApplicationModal {...defaultProps} application={existingApp} />)
    expect(screen.getByRole('button', { name: 'History' })).toBeInTheDocument()
  })

  it('shows empty state when there is no history', async () => {
    render(<ApplicationModal {...defaultProps} application={existingApp} />)
    await userEvent.click(screen.getByRole('button', { name: 'History' }))
    expect(await screen.findByText('No status history recorded yet.')).toBeInTheDocument()
  })

  it('shows timeline entries when history data is available', async () => {
    vi.mocked(createClient).mockReturnValueOnce({
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
        order: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        then: vi.fn(resolve => resolve({
          data: [
            { id: 'h1', application_id: 'app-1', status: 'applied', changed_at: '2026-05-01T10:00:00Z' },
            { id: 'h2', application_id: 'app-1', status: 'future', changed_at: '2026-04-30T09:00:00Z' },
          ],
          error: null,
        })),
      })),
    } as unknown as ReturnType<typeof createClient>)

    render(<ApplicationModal {...defaultProps} application={existingApp} />)
    await userEvent.click(screen.getByRole('button', { name: 'History' }))

    expect(await screen.findByText('Applied')).toBeInTheDocument()
    expect(screen.getByText('Future')).toBeInTheDocument()
    expect(screen.getByText(/· initial/)).toBeInTheDocument()
  })
})

describe('ApplicationModal — keyboard and backdrop', () => {
  it('calls onClose when Escape is pressed', async () => {
    render(<ApplicationModal {...defaultProps} />)
    await userEvent.keyboard('{Escape}')
    expect(defaultProps.onClose).toHaveBeenCalled()
  })
})

describe('ApplicationModal — tab navigation', () => {
  it('renders section tabs', () => {
    render(<ApplicationModal {...defaultProps} />)
    expect(screen.getByRole('button', { name: 'Details' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Progress' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Job Description' })).toBeInTheDocument()
  })

  it('switches to Progress tab on click', async () => {
    render(<ApplicationModal {...defaultProps} />)
    await userEvent.click(screen.getByRole('button', { name: 'Progress' }))
    expect(screen.getByPlaceholderText(/follow up after interview/i)).toBeInTheDocument()
  })

  it('switches to Job Description tab on click', async () => {
    render(<ApplicationModal {...defaultProps} />)
    await userEvent.click(screen.getByRole('button', { name: 'Job Description' }))
    expect(screen.getByRole('textbox', { name: 'Job description editor' })).toBeInTheDocument()
  })

  it('shows rich-text formatting toolbar in the Job Description tab', async () => {
    render(<ApplicationModal {...defaultProps} />)
    await userEvent.click(screen.getByRole('button', { name: 'Job Description' }))
    expect(screen.getByRole('button', { name: 'Bold' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Italic' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Bullet list' })).toBeInTheDocument()
  })
})

describe('ApplicationModal — Job Posting URL open button', () => {
  it('renders an open-link button next to the URL field', () => {
    render(<ApplicationModal {...defaultProps} application={existingApp} />)
    expect(screen.getByRole('button', { name: 'Open job posting in new tab' })).toBeInTheDocument()
  })

  it('opens the application link in a new tab when clicked', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)
    try {
      render(<ApplicationModal {...defaultProps} application={existingApp} />)
      await userEvent.click(screen.getByRole('button', { name: 'Open job posting in new tab' }))
      expect(openSpy).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer')
    } finally {
      openSpy.mockRestore()
    }
  })

  it('opens the currently-typed URL even before saving the form', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)
    try {
      render(<ApplicationModal {...defaultProps} application={existingApp} />)
      const urlInput = screen.getByDisplayValue('https://example.com')
      await userEvent.clear(urlInput)
      await userEvent.type(urlInput, 'https://newcompany.com/jobs/42')
      await userEvent.click(screen.getByRole('button', { name: 'Open job posting in new tab' }))
      expect(openSpy).toHaveBeenLastCalledWith('https://newcompany.com/jobs/42', '_blank', 'noopener,noreferrer')
    } finally {
      openSpy.mockRestore()
    }
  })

  it('disables the open button when the URL is empty', () => {
    render(<ApplicationModal {...defaultProps} />)
    expect(screen.getByRole('button', { name: 'Open job posting in new tab' })).toBeDisabled()
  })

  it('does not open a new tab when clicked with no URL', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)
    try {
      render(<ApplicationModal {...defaultProps} />)
      const btn = screen.getByRole('button', { name: 'Open job posting in new tab' })
      await userEvent.click(btn)
      expect(openSpy).not.toHaveBeenCalled()
    } finally {
      openSpy.mockRestore()
    }
  })
})

describe('ApplicationModal — Job Description import', () => {
  const originalFetch = global.fetch
  afterEach(() => {
    global.fetch = originalFetch
  })

  it('does not render the import button when the URL is empty', () => {
    render(<ApplicationModal {...defaultProps} />)
    expect(
      screen.queryByRole('button', { name: 'Import job description from URL' })
    ).not.toBeInTheDocument()
  })

  it('renders the import button when a URL is present', () => {
    render(<ApplicationModal {...defaultProps} application={existingApp} />)
    expect(
      screen.getByRole('button', { name: 'Import job description from URL' })
    ).toBeInTheDocument()
  })

  it('fetches the job description and applies it to the JD field', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ html: '<p>Imported JD</p>', truncated: false }),
    }) as any
    const appNoJd: Application = { ...existingApp, jd: null }
    render(<ApplicationModal {...defaultProps} application={appNoJd} />)
    await userEvent.click(
      screen.getByRole('button', { name: 'Import job description from URL' })
    )
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      '/api/fetch-job-description',
      expect.objectContaining({ method: 'POST' })
    ))
    expect(
      await screen.findByRole('textbox', { name: 'Job description editor' })
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }))
    expect(document.querySelector('.jd-preview')?.innerHTML).toContain('Imported JD')
  })

  it('shows an overwrite prompt when JD already has content', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ html: '<p>New JD</p>', truncated: false }),
    }) as any
    const appWithJd: Application = { ...existingApp, jd: 'existing description' }
    render(<ApplicationModal {...defaultProps} application={appWithJd} />)
    await userEvent.click(
      screen.getByRole('button', { name: 'Import job description from URL' })
    )
    expect(await screen.findByText('Overwrite existing description?')).toBeInTheDocument()
  })

  it('applies the new JD when overwrite is confirmed', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ html: '<p>Replacement</p>', truncated: false }),
    }) as any
    const appWithJd: Application = { ...existingApp, jd: 'old description' }
    render(<ApplicationModal {...defaultProps} application={appWithJd} />)
    await userEvent.click(
      screen.getByRole('button', { name: 'Import job description from URL' })
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Overwrite' }))
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }))
    expect(document.querySelector('.jd-preview')?.innerHTML).toContain('Replacement')
  })

  it('keeps the existing JD when overwrite is cancelled', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ html: '<p>Replacement</p>', truncated: false }),
    }) as any
    const appWithJd: Application = { ...existingApp, jd: '<p>kept</p>' }
    render(<ApplicationModal {...defaultProps} application={appWithJd} />)
    await userEvent.click(
      screen.getByRole('button', { name: 'Import job description from URL' })
    )
    await screen.findByText('Overwrite existing description?')
    const cancelButtons = screen.getAllByRole('button', { name: 'Cancel' })
    await userEvent.click(cancelButtons[0])
    expect(screen.queryByText('Overwrite existing description?')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Job Description' }))
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }))
    expect(document.querySelector('.jd-preview')?.innerHTML).toContain('kept')
  })

  it('reverts to the previous JD when Revert is clicked after overwriting', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ html: '<p>Replacement</p>', truncated: false }),
    }) as any
    const appWithJd: Application = { ...existingApp, jd: '<p>original</p>' }
    render(<ApplicationModal {...defaultProps} application={appWithJd} />)
    await userEvent.click(
      screen.getByRole('button', { name: 'Import job description from URL' })
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Overwrite' }))
    const revert = await screen.findByRole('button', { name: 'Revert' })
    await userEvent.click(revert)
    expect(screen.queryByRole('button', { name: 'Revert' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }))
    expect(document.querySelector('.jd-preview')?.innerHTML).toContain('original')
  })

  it('shows an error when the API returns a failure', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: 'Could not reach that URL' }),
    }) as any
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<ApplicationModal {...defaultProps} application={existingApp} />)
    await userEvent.click(
      screen.getByRole('button', { name: 'Import job description from URL' })
    )
    expect(await screen.findByText('Could not reach that URL')).toBeInTheDocument()
    errorSpy.mockRestore()
  })

  it('falls back to a generic message when error JSON parsing fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockRejectedValue(new Error('bad json')),
    }) as any
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<ApplicationModal {...defaultProps} application={existingApp} />)
    await userEvent.click(
      screen.getByRole('button', { name: 'Import job description from URL' })
    )
    expect(await screen.findByText('Could not import job description')).toBeInTheDocument()
    errorSpy.mockRestore()
  })

  it('shows an error when the API returns empty HTML', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ html: '   ', truncated: false }),
    }) as any
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<ApplicationModal {...defaultProps} application={existingApp} />)
    await userEvent.click(
      screen.getByRole('button', { name: 'Import job description from URL' })
    )
    expect(await screen.findByText('Empty response from job posting URL')).toBeInTheDocument()
    errorSpy.mockRestore()
  })

  it('dismisses the import error when the close button is clicked', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: 'Could not reach that URL' }),
    }) as any
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<ApplicationModal {...defaultProps} application={existingApp} />)
    await userEvent.click(
      screen.getByRole('button', { name: 'Import job description from URL' })
    )
    expect(await screen.findByText('Could not reach that URL')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss error' }))
    expect(screen.queryByText('Could not reach that URL')).not.toBeInTheDocument()
    errorSpy.mockRestore()
  })

  it('shows an error when fetch itself throws', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network failure')) as any
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<ApplicationModal {...defaultProps} application={existingApp} />)
    await userEvent.click(
      screen.getByRole('button', { name: 'Import job description from URL' })
    )
    expect(await screen.findByText('network failure')).toBeInTheDocument()
    errorSpy.mockRestore()
  })

  it('falls back to a generic message when fetch throws a non-Error value', async () => {
    global.fetch = vi.fn().mockRejectedValue('not an error') as any
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<ApplicationModal {...defaultProps} application={existingApp} />)
    await userEvent.click(
      screen.getByRole('button', { name: 'Import job description from URL' })
    )
    expect(await screen.findByText('Failed to import job description')).toBeInTheDocument()
    errorSpy.mockRestore()
  })
})

describe('ApplicationModal — JD preview', () => {
  it('renders HTML job description via dangerouslySetInnerHTML without React errors', async () => {
    const appWithHtml: Application = { ...existingApp, jd: '<p>Hello <strong>world</strong></p>' }
    render(<ApplicationModal {...defaultProps} application={appWithHtml} />)
    await userEvent.click(screen.getByRole('button', { name: 'Job Description' }))
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }))
    expect(document.querySelector('.jd-preview')?.innerHTML).toContain('<strong>world</strong>')
  })

  it('renders plain-text job description in a <pre> block', async () => {
    const appWithText: Application = { ...existingApp, jd: 'Plain text JD\nwith newlines' }
    render(<ApplicationModal {...defaultProps} application={appWithText} />)
    await userEvent.click(screen.getByRole('button', { name: 'Job Description' }))
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }))
    expect(screen.getByText(/Plain text JD/)).toBeInTheDocument()
  })

  it('shows "Nothing to preview" when JD is empty', async () => {
    render(<ApplicationModal {...defaultProps} application={existingApp} />)
    await userEvent.click(screen.getByRole('button', { name: 'Job Description' }))
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }))
    expect(screen.getByText('Nothing to preview.')).toBeInTheDocument()
  })
})

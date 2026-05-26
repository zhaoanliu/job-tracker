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

describe('ApplicationModal — Import job description', () => {
  let originalFetch: typeof global.fetch
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    originalFetch = global.fetch
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    global.fetch = originalFetch
    consoleErrorSpy.mockRestore()
    vi.useRealTimers()
  })

  it('hides the Import button when the URL field is empty', () => {
    render(<ApplicationModal {...defaultProps} />)
    expect(screen.queryByRole('button', { name: 'Import job description from URL' })).not.toBeInTheDocument()
  })

  it('shows the Import button when the URL field has content', async () => {
    render(<ApplicationModal {...defaultProps} />)
    const urlInput = screen.getByPlaceholderText('https://...')
    await userEvent.type(urlInput, 'https://example.com/jobs/1')
    expect(screen.getByRole('button', { name: 'Import job description from URL' })).toBeInTheDocument()
  })

  it('hides the Import button when the URL is only whitespace', async () => {
    render(<ApplicationModal {...defaultProps} />)
    const urlInput = screen.getByPlaceholderText('https://...')
    await userEvent.type(urlInput, '   ')
    expect(screen.queryByRole('button', { name: 'Import job description from URL' })).not.toBeInTheDocument()
  })

  it('populates the JD field and switches to the Job Description tab when description is empty', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ html: '<p>Imported description</p>' }),
    }) as unknown as typeof global.fetch

    render(<ApplicationModal {...defaultProps} application={existingApp} />)
    await userEvent.click(screen.getByRole('button', { name: 'Import job description from URL' }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/fetch-job-description',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: 'https://example.com' }),
        })
      )
    })

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Job description editor' })).toBeInTheDocument()
    })
    expect(screen.getByRole('textbox', { name: 'Job description editor' }).innerHTML).toContain('Imported description')
  })

  it('shows a loading spinner while the import request is pending', async () => {
    let resolveFetch: (value: { ok: boolean; json: () => Promise<{ html: string }> }) => void = () => {}
    const fetchPromise = new Promise<{ ok: boolean; json: () => Promise<{ html: string }> }>(resolve => {
      resolveFetch = resolve
    })
    global.fetch = vi.fn().mockReturnValue(fetchPromise) as unknown as typeof global.fetch

    render(<ApplicationModal {...defaultProps} application={existingApp} />)
    const importBtn = screen.getByRole('button', { name: 'Import job description from URL' })
    await userEvent.click(importBtn)

    expect(screen.getByRole('status', { name: 'Importing' })).toBeInTheDocument()
    expect(importBtn).toBeDisabled()
    expect(importBtn).toHaveAttribute('aria-busy', 'true')

    resolveFetch({ ok: true, json: async () => ({ html: '<p>done</p>' }) })
    await waitFor(() => {
      expect(screen.queryByRole('status', { name: 'Importing' })).not.toBeInTheDocument()
    })
  })

  it('shows an error message, leaves description empty, and stays on the Details tab when fetch fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({ error: 'Failed to fetch job description' }),
    }) as unknown as typeof global.fetch

    render(<ApplicationModal {...defaultProps} application={existingApp} />)
    await userEvent.click(screen.getByRole('button', { name: 'Import job description from URL' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to fetch job description')
    expect(screen.queryByRole('textbox', { name: 'Job description editor' })).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText('https://...')).toBeInTheDocument()
    expect(consoleErrorSpy).toHaveBeenCalled()
  })

  it('shows an error message when the network request rejects', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network down')) as unknown as typeof global.fetch

    render(<ApplicationModal {...defaultProps} application={existingApp} />)
    await userEvent.click(screen.getByRole('button', { name: 'Import job description from URL' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Network down')
    expect(screen.queryByRole('textbox', { name: 'Job description editor' })).not.toBeInTheDocument()
    expect(consoleErrorSpy).toHaveBeenCalled()
  })

  it('does not overwrite a non-empty description but still switches to the JD tab', async () => {
    const appWithJd: Application = { ...existingApp, jd: '<p>Existing JD</p>' }
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ html: '<p>New imported content</p>' }),
    }) as unknown as typeof global.fetch

    render(<ApplicationModal {...defaultProps} application={appWithJd} />)
    await userEvent.click(screen.getByRole('button', { name: 'Import job description from URL' }))

    expect(await screen.findByRole('button', { name: 'Use Imported' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Keep Original' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Job description editor' })).not.toBeInTheDocument()
  })
})

describe('ApplicationModal — Import comparison toggle', () => {
  const appWithJd: Application = { ...existingApp, jd: '<p>Existing JD</p>' }
  let originalFetch: typeof global.fetch
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    originalFetch = global.fetch
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ html: '<p>New imported content</p>' }),
    }) as unknown as typeof global.fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
    consoleErrorSpy.mockRestore()
  })

  async function triggerImport() {
    await userEvent.click(screen.getByRole('button', { name: 'Import job description from URL' }))
    await screen.findByRole('button', { name: 'Use Imported' })
  }

  it('shows the comparison toggle strip on the JD tab after a successful Import when description is non-empty', async () => {
    render(<ApplicationModal {...defaultProps} application={appWithJd} />)
    await triggerImport()

    expect(screen.getByRole('button', { name: 'Original' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Imported' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Keep Original' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Use Imported' })).toBeInTheDocument()

    const jdTab = screen.getByRole('button', { name: 'Job Description' })
    expect(jdTab.className).toContain('border-indigo-500')

    const view = screen.getByTestId('jd-comparison-view')
    expect(view.innerHTML).toContain('New imported content')
  })

  it('flipping the segmented control swaps the displayed content between original and imported', async () => {
    render(<ApplicationModal {...defaultProps} application={appWithJd} />)
    await triggerImport()

    const view = screen.getByTestId('jd-comparison-view')
    expect(view.innerHTML).toContain('New imported content')
    expect(view.innerHTML).not.toContain('Existing JD')

    await userEvent.click(screen.getByRole('button', { name: 'Original' }))
    expect(screen.getByTestId('jd-comparison-view').innerHTML).toContain('Existing JD')
    expect(screen.getByTestId('jd-comparison-view').innerHTML).not.toContain('New imported content')

    await userEvent.click(screen.getByRole('button', { name: 'Imported' }))
    expect(screen.getByTestId('jd-comparison-view').innerHTML).toContain('New imported content')
  })

  it('Use Imported commits imported content to the form and hides the toggle strip', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<ApplicationModal {...defaultProps} application={appWithJd} onSave={onSave} />)
    await triggerImport()

    await userEvent.click(screen.getByRole('button', { name: 'Use Imported' }))

    expect(screen.queryByTestId('jd-comparison-view')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Use Imported' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Keep Original' })).not.toBeInTheDocument()

    const editor = await screen.findByRole('textbox', { name: 'Job description editor' })
    expect(editor.innerHTML).toContain('New imported content')

    await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave.mock.calls[0][0].jd).toBe('<p>New imported content</p>')
  })

  it('Keep Original hides the toggle and preserves the original description unchanged', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<ApplicationModal {...defaultProps} application={appWithJd} onSave={onSave} />)
    await triggerImport()

    await userEvent.click(screen.getByRole('button', { name: 'Keep Original' }))

    expect(screen.queryByTestId('jd-comparison-view')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Use Imported' })).not.toBeInTheDocument()

    const editor = await screen.findByRole('textbox', { name: 'Job description editor' })
    expect(editor.innerHTML).toContain('Existing JD')
    expect(editor.innerHTML).not.toContain('New imported content')

    await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave.mock.calls[0][0].jd).toBe('<p>Existing JD</p>')
  })

  it('switching away from the JD tab while toggle is open discards imported and preserves original', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<ApplicationModal {...defaultProps} application={appWithJd} onSave={onSave} />)
    await triggerImport()

    await userEvent.click(screen.getByRole('button', { name: 'Details' }))

    await userEvent.click(screen.getByRole('button', { name: 'Job Description' }))
    expect(screen.queryByTestId('jd-comparison-view')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Use Imported' })).not.toBeInTheDocument()

    const editor = await screen.findByRole('textbox', { name: 'Job description editor' })
    expect(editor.innerHTML).toContain('Existing JD')
    expect(editor.innerHTML).not.toContain('New imported content')

    await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave.mock.calls[0][0].jd).toBe('<p>Existing JD</p>')
  })

  it('discards imported content if the modal is closed (saved) without choosing — original is preserved', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<ApplicationModal {...defaultProps} application={appWithJd} onSave={onSave} />)
    await triggerImport()

    expect(screen.getByTestId('jd-comparison-view').innerHTML).toContain('New imported content')

    await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave.mock.calls[0][0].jd).toBe('<p>Existing JD</p>')
  })

  it('discards imported content when the modal is dismissed via Cancel without choosing', async () => {
    const onClose = vi.fn()
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<ApplicationModal {...defaultProps} application={appWithJd} onSave={onSave} onClose={onClose} />)
    await triggerImport()

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
    expect(onSave).not.toHaveBeenCalled()
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

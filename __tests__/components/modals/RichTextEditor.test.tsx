import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RichTextEditor from '@/components/modals/RichTextEditor'

describe('RichTextEditor', () => {
  let execSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    if (!document.execCommand) {
      ;(document as unknown as { execCommand: () => boolean }).execCommand = () => true
    }
    execSpy = vi.spyOn(document, 'execCommand').mockReturnValue(true)
  })

  afterEach(() => {
    execSpy.mockRestore()
  })

  it('renders the formatting toolbar', () => {
    render(<RichTextEditor value="" onChange={vi.fn()} />)
    expect(screen.getByRole('toolbar', { name: 'Formatting' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Bold' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Italic' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Underline' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Bullet list' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Numbered list' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Insert link' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear formatting' })).toBeInTheDocument()
  })

  it('renders an accessible editable textbox', () => {
    render(<RichTextEditor value="" onChange={vi.fn()} />)
    const editor = screen.getByRole('textbox', { name: 'Job description editor' })
    expect(editor).toHaveAttribute('contenteditable', 'true')
  })

  it('shows placeholder text when value is empty', () => {
    render(<RichTextEditor value="" onChange={vi.fn()} placeholder="Type here…" />)
    expect(screen.getByText('Type here…')).toBeInTheDocument()
  })

  it('hides placeholder when value is non-empty HTML', () => {
    render(<RichTextEditor value="<p>Hello</p>" onChange={vi.fn()} placeholder="Type here…" />)
    expect(screen.queryByText('Type here…')).not.toBeInTheDocument()
  })

  it('renders initial HTML content into the editor', () => {
    render(<RichTextEditor value="<p>Hello <strong>world</strong></p>" onChange={vi.fn()} />)
    const editor = screen.getByRole('textbox', { name: 'Job description editor' })
    expect(editor.innerHTML).toContain('<strong>world</strong>')
  })

  it('converts plain-text newlines to <br> on initialization', () => {
    render(<RichTextEditor value={'line one\nline two'} onChange={vi.fn()} />)
    const editor = screen.getByRole('textbox', { name: 'Job description editor' })
    expect(editor.innerHTML).toBe('line one<br>line two')
  })

  it('escapes HTML-looking characters in plain-text input on initialization', () => {
    render(<RichTextEditor value={'a & b'} onChange={vi.fn()} />)
    const editor = screen.getByRole('textbox', { name: 'Job description editor' })
    expect(editor.innerHTML).toBe('a &amp; b')
  })

  it('calls execCommand("bold") when Bold is clicked', async () => {
    render(<RichTextEditor value="" onChange={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Bold' }))
    expect(execSpy).toHaveBeenCalledWith('bold', false, undefined)
  })

  it('calls execCommand("italic") when Italic is clicked', async () => {
    render(<RichTextEditor value="" onChange={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Italic' }))
    expect(execSpy).toHaveBeenCalledWith('italic', false, undefined)
  })

  it('calls execCommand("underline") when Underline is clicked', async () => {
    render(<RichTextEditor value="" onChange={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Underline' }))
    expect(execSpy).toHaveBeenCalledWith('underline', false, undefined)
  })

  it('calls execCommand("insertUnorderedList") when Bullet list is clicked', async () => {
    render(<RichTextEditor value="" onChange={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Bullet list' }))
    expect(execSpy).toHaveBeenCalledWith('insertUnorderedList', false, undefined)
  })

  it('calls execCommand("insertOrderedList") when Numbered list is clicked', async () => {
    render(<RichTextEditor value="" onChange={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Numbered list' }))
    expect(execSpy).toHaveBeenCalledWith('insertOrderedList', false, undefined)
  })

  it('calls execCommand("removeFormat") when Clear is clicked', async () => {
    render(<RichTextEditor value="" onChange={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Clear formatting' }))
    expect(execSpy).toHaveBeenCalledWith('removeFormat', false, undefined)
  })

  it('prompts for a URL and runs createLink when Link is clicked', async () => {
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('https://example.com')
    render(<RichTextEditor value="" onChange={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Insert link' }))
    expect(promptSpy).toHaveBeenCalled()
    expect(execSpy).toHaveBeenCalledWith('createLink', false, 'https://example.com')
    promptSpy.mockRestore()
  })

  it('does not call createLink when the URL prompt is cancelled', async () => {
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue(null)
    render(<RichTextEditor value="" onChange={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Insert link' }))
    expect(execSpy).not.toHaveBeenCalledWith('createLink', false, expect.anything())
    promptSpy.mockRestore()
  })

  it('emits onChange with the editor HTML when input fires', () => {
    const onChange = vi.fn()
    render(<RichTextEditor value="" onChange={onChange} />)
    const editor = screen.getByRole('textbox', { name: 'Job description editor' })
    editor.innerHTML = '<p>Typed something</p>'
    fireEvent.input(editor)
    expect(onChange).toHaveBeenCalledWith('<p>Typed something</p>')
  })

  it('hides the placeholder once content is typed', () => {
    const onChange = vi.fn()
    render(<RichTextEditor value="" onChange={onChange} placeholder="Type here…" />)
    expect(screen.getByText('Type here…')).toBeInTheDocument()
    const editor = screen.getByRole('textbox', { name: 'Job description editor' })
    editor.innerHTML = 'Some content'
    fireEvent.input(editor)
    expect(screen.queryByText('Type here…')).not.toBeInTheDocument()
  })

  it('shows the placeholder again when content is cleared', () => {
    const onChange = vi.fn()
    render(<RichTextEditor value="<p>Hello</p>" onChange={onChange} placeholder="Type here…" />)
    expect(screen.queryByText('Type here…')).not.toBeInTheDocument()
    const editor = screen.getByRole('textbox', { name: 'Job description editor' })
    editor.innerHTML = '<br>'
    fireEvent.input(editor)
    expect(screen.getByText('Type here…')).toBeInTheDocument()
  })
})

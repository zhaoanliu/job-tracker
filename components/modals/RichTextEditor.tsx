'use client'

import { useEffect, useRef, useState } from 'react'

interface RichTextEditorProps {
  value: string
  onChange: (html: string) => void
  placeholder?: string
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function toHtml(value: string): string {
  if (!value) return ''
  if (/<[a-z][\s\S]*>/i.test(value)) return value
  return escapeHtml(value).replace(/\n/g, '<br>')
}

function isHtmlEmpty(html: string): boolean {
  const stripped = html.replace(/<br\s*\/?>/gi, '').replace(/<\/?(div|p|span)[^>]*>/gi, '').trim()
  return stripped.length === 0
}

export default function RichTextEditor({ value, onChange, placeholder }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const [empty, setEmpty] = useState(() => isHtmlEmpty(value))

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = toHtml(value)
      setEmpty(isHtmlEmpty(editorRef.current.innerHTML))
    }
    // Initialize once on mount; the modal remounts per application so value
    // never changes from outside while editing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function emitChange() {
    if (!editorRef.current) return
    const html = editorRef.current.innerHTML
    setEmpty(isHtmlEmpty(html))
    onChange(html)
  }

  function exec(command: string, arg?: string) {
    editorRef.current?.focus()
    document.execCommand(command, false, arg)
    emitChange()
  }

  function handleLink() {
    const url = window.prompt('Enter URL')
    if (!url) return
    exec('createLink', url)
  }

  const btnClass =
    'min-w-[1.75rem] h-7 px-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded transition-colors flex items-center justify-center'

  return (
    <div className="rounded-lg border border-slate-300 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-transparent">
      <div className="flex items-center gap-0.5 border-b border-slate-200 px-1.5 py-1 flex-wrap" role="toolbar" aria-label="Formatting">
        <button type="button" onClick={() => exec('bold')} className={btnClass} aria-label="Bold" title="Bold">
          <strong>B</strong>
        </button>
        <button type="button" onClick={() => exec('italic')} className={btnClass} aria-label="Italic" title="Italic">
          <em>I</em>
        </button>
        <button type="button" onClick={() => exec('underline')} className={btnClass} aria-label="Underline" title="Underline">
          <span className="underline">U</span>
        </button>
        <span className="w-px h-4 bg-slate-200 mx-1" aria-hidden />
        <button type="button" onClick={() => exec('insertUnorderedList')} className={btnClass} aria-label="Bullet list" title="Bullet list">
          •&nbsp;List
        </button>
        <button type="button" onClick={() => exec('insertOrderedList')} className={btnClass} aria-label="Numbered list" title="Numbered list">
          1.&nbsp;List
        </button>
        <span className="w-px h-4 bg-slate-200 mx-1" aria-hidden />
        <button type="button" onClick={handleLink} className={btnClass} aria-label="Insert link" title="Insert link">
          Link
        </button>
        <button type="button" onClick={() => exec('removeFormat')} className={btnClass} aria-label="Clear formatting" title="Clear formatting">
          Clear
        </button>
      </div>
      <div className="relative">
        {empty && placeholder && (
          <div className="absolute top-2 left-3 pointer-events-none text-slate-400 text-sm select-none">
            {placeholder}
          </div>
        )}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label="Job description editor"
          onInput={emitChange}
          onBlur={emitChange}
          className="jd-preview min-h-[18rem] max-h-[28rem] overflow-y-auto px-3 py-2 text-sm text-slate-700 focus:outline-none"
        />
      </div>
    </div>
  )
}

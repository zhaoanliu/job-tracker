import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import {
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
  ThemeProvider,
  useTheme,
} from '@/components/ui/ThemeProvider'

function wrapper({ children }: { children: React.ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.classList.remove('dark')
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockReturnValue({ matches: false } as MediaQueryList),
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('defaults to light theme when no stored preference and no dark media query', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })
    expect(result.current.theme).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('reads stored "dark" preference from localStorage on mount', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    const { result } = renderHook(() => useTheme(), { wrapper })
    expect(result.current.theme).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('reads stored "light" preference from localStorage on mount', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light')
    const { result } = renderHook(() => useTheme(), { wrapper })
    expect(result.current.theme).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('falls back to system dark preference when no stored value', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn((query: string) => ({
        matches: query === '(prefers-color-scheme: dark)',
      }) as MediaQueryList),
    })

    const { result } = renderHook(() => useTheme(), { wrapper })
    expect(result.current.theme).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('ignores invalid stored values', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'sepia')
    const { result } = renderHook(() => useTheme(), { wrapper })
    expect(result.current.theme).toBe('light')
  })

  it('returns light when readStoredTheme throws', () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const { result } = renderHook(() => useTheme(), { wrapper })
    expect(result.current.theme).toBe('light')
  })

  it('setTheme updates state, document class, and persists to localStorage', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })
    act(() => result.current.setTheme('dark'))
    expect(result.current.theme).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')

    act(() => result.current.setTheme('light'))
    expect(result.current.theme).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
  })

  it('setTheme swallows localStorage errors', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(() => act(() => result.current.setTheme('dark'))).not.toThrow()
    expect(result.current.theme).toBe('dark')
  })

  it('toggleTheme flips between light and dark', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })
    expect(result.current.theme).toBe('light')

    act(() => result.current.toggleTheme())
    expect(result.current.theme).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    act(() => result.current.toggleTheme())
    expect(result.current.theme).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('renders children inside the provider', () => {
    render(
      <ThemeProvider>
        <span>hello-theme</span>
      </ThemeProvider>
    )
    expect(screen.getByText('hello-theme')).toBeInTheDocument()
  })
})

describe('useTheme outside provider', () => {
  it('returns a safe no-op default when no provider is present', () => {
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('light')
    expect(() => result.current.setTheme('dark')).not.toThrow()
    expect(() => result.current.toggleTheme()).not.toThrow()
  })
})

describe('route announcer fix', () => {
  function makeAnnouncer() {
    const host = document.createElement('next-route-announcer')
    const shadow = host.attachShadow({ mode: 'open' })
    const el = document.createElement('div')
    el.id = '__next-route-announcer__'
    el.style.width = '1px'
    el.style.height = '1px'
    el.style.margin = '-1px'
    shadow.appendChild(el)
    return { host, el }
  }

  it('sets width/height/margin to 0 on the shadow-DOM announcer when already present [AC-622-1]', () => {
    const { host, el } = makeAnnouncer()
    document.body.appendChild(host)
    render(<ThemeProvider><span /></ThemeProvider>)
    expect(el.style.width).toBe('0px')
    expect(el.style.height).toBe('0px')
    expect(el.style.margin).toBe('0px')
    document.body.removeChild(host)
  })

  it('applies the fix via MutationObserver when the announcer is added after mount [AC-622-1]', async () => {
    render(<ThemeProvider><span /></ThemeProvider>)
    const { host, el } = makeAnnouncer()
    document.body.appendChild(host)
    await waitFor(() => expect(el.style.width).toBe('0px'))
    expect(el.style.height).toBe('0px')
    document.body.removeChild(host)
  })
})

describe('THEME_INIT_SCRIPT', () => {
  it('includes the storage key', () => {
    expect(THEME_INIT_SCRIPT).toContain(THEME_STORAGE_KEY)
  })

  it('applies the dark class when localStorage holds "dark"', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    document.documentElement.classList.remove('dark')
    new Function(THEME_INIT_SCRIPT)()
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('does not apply the dark class when localStorage holds "light"', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light')
    document.documentElement.classList.add('dark')
    document.documentElement.classList.remove('dark')
    new Function(THEME_INIT_SCRIPT)()
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('does not throw when localStorage access fails', () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => new Function(THEME_INIT_SCRIPT)()).not.toThrow()
  })
})

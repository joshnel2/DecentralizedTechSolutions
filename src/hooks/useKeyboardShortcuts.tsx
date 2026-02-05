/**
 * Keyboard Shortcuts Hook
 * Global keyboard shortcuts for power users
 */

import { useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAIChat } from '../contexts/AIChatContext'

interface ShortcutConfig {
  key: string
  ctrl?: boolean
  meta?: boolean
  shift?: boolean
  alt?: boolean
  action: () => void
  description: string
}

// Check if we're on macOS
const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)

export function useKeyboardShortcuts() {
  const navigate = useNavigate()
  const { openChat, closeChat, isOpen: isChatOpen } = useAIChat()

  // Define shortcuts
  const shortcuts: ShortcutConfig[] = [
    // AI Chat toggle - Cmd/Ctrl + K
    {
      key: 'k',
      meta: isMac,
      ctrl: !isMac,
      action: () => {
        if (isChatOpen) {
          closeChat()
        } else {
          openChat({ label: 'Quick Chat' })
        }
      },
      description: 'Toggle AI Chat'
    },
    // Quick search - Cmd/Ctrl + /
    {
      key: '/',
      meta: isMac,
      ctrl: !isMac,
      action: () => {
        // Focus global search if it exists
        const searchInput = document.querySelector('[data-global-search]') as HTMLInputElement
        if (searchInput) {
          searchInput.focus()
        }
      },
      description: 'Focus search'
    },
    // Go to Dashboard - G then D
    {
      key: 'd',
      alt: true,
      action: () => navigate('/app/dashboard'),
      description: 'Go to Dashboard'
    },
    // Go to Matters - G then M
    {
      key: 'm',
      alt: true,
      action: () => navigate('/app/matters'),
      description: 'Go to Matters'
    },
    // Go to Background Agent - G then B
    {
      key: 'b',
      alt: true,
      action: () => navigate('/app/background-agent'),
      description: 'Go to Background Agent'
    },
    // Go to Calendar - G then C
    {
      key: 'c',
      alt: true,
      action: () => navigate('/app/calendar'),
      description: 'Go to Calendar'
    },
    // Go to Documents - G then O
    {
      key: 'o',
      alt: true,
      action: () => navigate('/app/documents'),
      description: 'Go to Documents'
    },
    // Go to Billing - G then I
    {
      key: 'i',
      alt: true,
      action: () => navigate('/app/billing'),
      description: 'Go to Billing'
    },
    // New Matter - N then M (Shift + N)
    {
      key: 'n',
      shift: true,
      meta: isMac,
      ctrl: !isMac,
      action: () => navigate('/app/matters?new=true'),
      description: 'New Matter'
    },
    // Escape to close modals/chat
    {
      key: 'Escape',
      action: () => {
        if (isChatOpen) {
          closeChat()
        }
      },
      description: 'Close chat/modal'
    }
  ]

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Don't trigger shortcuts when typing in inputs
    const target = event.target as HTMLElement
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    ) {
      // Still allow Escape
      if (event.key !== 'Escape') return
    }

    for (const shortcut of shortcuts) {
      const metaMatch = shortcut.meta ? event.metaKey : !event.metaKey || !shortcut.meta
      const ctrlMatch = shortcut.ctrl ? event.ctrlKey : !event.ctrlKey || !shortcut.ctrl
      const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey || !shortcut.shift
      const altMatch = shortcut.alt ? event.altKey : !event.altKey || !shortcut.alt
      const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase()

      if (keyMatch && metaMatch && ctrlMatch && shiftMatch && altMatch) {
        event.preventDefault()
        shortcut.action()
        return
      }
    }
  }, [shortcuts, isChatOpen])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return { shortcuts }
}

// Component to display keyboard shortcuts help
export function KeyboardShortcutsHelp() {
  const modKey = isMac ? '⌘' : 'Ctrl'
  
  return (
    <div style={{ padding: '16px' }}>
      <h3 style={{ marginBottom: '16px' }}>Keyboard Shortcuts</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          <tr>
            <td style={{ padding: '8px', color: '#94a3b8' }}>Toggle AI Chat</td>
            <td style={{ padding: '8px', textAlign: 'right' }}><kbd>{modKey}</kbd> + <kbd>K</kbd></td>
          </tr>
          <tr>
            <td style={{ padding: '8px', color: '#94a3b8' }}>Focus Search</td>
            <td style={{ padding: '8px', textAlign: 'right' }}><kbd>{modKey}</kbd> + <kbd>/</kbd></td>
          </tr>
          <tr>
            <td style={{ padding: '8px', color: '#94a3b8' }}>Go to Dashboard</td>
            <td style={{ padding: '8px', textAlign: 'right' }}><kbd>Alt</kbd> + <kbd>D</kbd></td>
          </tr>
          <tr>
            <td style={{ padding: '8px', color: '#94a3b8' }}>Go to Matters</td>
            <td style={{ padding: '8px', textAlign: 'right' }}><kbd>Alt</kbd> + <kbd>M</kbd></td>
          </tr>
          <tr>
            <td style={{ padding: '8px', color: '#94a3b8' }}>Go to Background Agent</td>
            <td style={{ padding: '8px', textAlign: 'right' }}><kbd>Alt</kbd> + <kbd>B</kbd></td>
          </tr>
          <tr>
            <td style={{ padding: '8px', color: '#94a3b8' }}>Go to Calendar</td>
            <td style={{ padding: '8px', textAlign: 'right' }}><kbd>Alt</kbd> + <kbd>C</kbd></td>
          </tr>
          <tr>
            <td style={{ padding: '8px', color: '#94a3b8' }}>Go to Documents</td>
            <td style={{ padding: '8px', textAlign: 'right' }}><kbd>Alt</kbd> + <kbd>O</kbd></td>
          </tr>
          <tr>
            <td style={{ padding: '8px', color: '#94a3b8' }}>Go to Billing</td>
            <td style={{ padding: '8px', textAlign: 'right' }}><kbd>Alt</kbd> + <kbd>I</kbd></td>
          </tr>
          <tr>
            <td style={{ padding: '8px', color: '#94a3b8' }}>Close Modal/Chat</td>
            <td style={{ padding: '8px', textAlign: 'right' }}><kbd>Esc</kbd></td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

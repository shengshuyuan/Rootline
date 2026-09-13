import { useLayoutEffect, useRef } from 'react'
import type { RefObject } from 'react'

const FOCUSABLE_SELECTOR = [
  'button:not(:disabled)',
  '[href]',
  'input:not(:disabled):not([type="hidden"])',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function isHidden(element: HTMLElement, container: HTMLElement): boolean {
  let current: HTMLElement | null = element
  while (current) {
    if (current.hidden || current.inert || current.getAttribute('aria-hidden') === 'true') {
      return true
    }
    const style = window.getComputedStyle(current)
    if (style.display === 'none' || style.visibility === 'hidden') return true
    if (current === container) break
    current = current.parentElement
  }
  return false
}

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => !isHidden(element, container),
  )
}

/**
 * Moves focus into a mounted dialog and keeps sequential keyboard focus inside it.
 * Focus restoration is intentionally left to the component that opens the dialog.
 */
export function useDialogFocusTrap<T extends HTMLElement>(): RefObject<T> {
  const dialogRef = useRef<T>(null)

  useLayoutEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    const focusable = focusableElements(dialog)
    const requestedInitialFocus = dialog.querySelector<HTMLElement>('[autofocus]')
    const initialFocus = requestedInitialFocus && focusable.includes(requestedInitialFocus)
      ? requestedInitialFocus
      : focusable[0] ?? dialog
    initialFocus.focus()

    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return

      const focusable = focusableElements(dialog)
      if (focusable.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement

      if (!dialog.contains(active)) {
        event.preventDefault()
        const target = event.shiftKey ? last : first
        target.focus()
      } else if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', trapFocus, true)
    return () => document.removeEventListener('keydown', trapFocus, true)
  }, [])

  return dialogRef
}

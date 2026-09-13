import { useEffect } from 'react'

/** Close dialogs on Escape. Caller should pass a guarded close (e.g. dirty confirm). */
export function useEscapeClose(onClose: () => void): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])
}

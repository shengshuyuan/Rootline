import { useCallback } from 'react'

/**
 * Close handler that prompts when the form is dirty.
 * Always preferred for backdrop click and Escape.
 */
export function useGuardedClose(isDirty: boolean, onClose: () => void): () => void {
  return useCallback(() => {
    if (isDirty) {
      const ok = window.confirm('内容已修改，确定放弃修改？')
      if (!ok) return
    }
    onClose()
  }, [isDirty, onClose])
}

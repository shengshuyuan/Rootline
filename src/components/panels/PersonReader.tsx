import { useLayoutEffect } from 'react'
import { useDialogFocusTrap } from '../../hooks/useDialogFocusTrap'
import { useEscapeClose } from '../../hooks/useEscapeClose'

interface PersonReaderProps {
  title: string
  personName: string
  content: string
  onClose: () => void
}

export function PersonReader({ title, personName, content, onClose }: PersonReaderProps) {
  useLayoutEffect(() => {
    const trigger = document.activeElement as HTMLElement | null
    return () => { if (trigger?.isConnected) trigger.focus() }
  }, [])
  const dialogRef = useDialogFocusTrap<HTMLElement>()
  useEscapeClose(onClose)

  return (
    <div className="modal-backdrop person-reader-backdrop" role="presentation" onClick={onClose}>
      <article
        ref={dialogRef}
        className="person-reader-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="person-reader-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="person-reader-header">
          <div>
            <p className="eyebrow">{personName}</p>
            <h2 id="person-reader-title">{title}</h2>
          </div>
          <button type="button" aria-label="关闭阅读" onClick={onClose}>关闭</button>
        </header>
        <div className="person-reader-content">
          <p>{content}</p>
        </div>
      </article>
    </div>
  )
}

import { useRef } from 'react'
import type { SaveStatus } from '../hooks/useTreeStorage'

interface AppToolbarProps {
  name: string
  saveStatus: SaveStatus
  saveStatusLabel: string
  toast: string
  query: string
  setQuery: (query: string) => void
  shareBusy: boolean
  busy: boolean
  onSettings: () => void
  onImport: () => void
  onExportJson: () => void
  onExportExcel: () => void
  onShare: () => void
  onRecovery: () => void
  onAddPerson: () => void
}

export function AppToolbar(props: AppToolbarProps) {
  const menuRef = useRef<HTMLDetailsElement>(null)
  const invoke = (action: () => void) => {
    if (menuRef.current) menuRef.current.open = false
    action()
  }
  return (
    <header className="topbar">
      <a className="brand" href="#" onClick={(event) => event.preventDefault()} aria-label="族源 Rootline">
        <img src="/rootline-mark.svg" alt="" width="32" height="32" />
        <b>族源 <span>Rootline</span></b>
      </a>
      <details ref={menuRef} className="toolbar-menu desktop-toolbar-control tree-menu" onKeyDown={(event) => {
        if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus() }
      }}>
        <summary aria-label="族谱与数据菜单"><span>{props.name}</span><span className="menu-caret" aria-hidden="true">⌄</span></summary>
        <div className="toolbar-menu-panel" role="group" aria-label="数据操作">
          <p className="menu-heading">管理这份家谱</p>
          <button type="button" disabled={props.busy} onClick={() => invoke(props.onSettings)}>族谱设置</button>
          <button type="button" disabled={props.busy} onClick={() => invoke(props.onImport)}>导入族谱</button>
          <hr />
          <button type="button" onClick={() => invoke(props.onExportJson)}>导出 JSON 备份</button>
          <button type="button" onClick={() => invoke(props.onExportExcel)}>导出 Excel 维护表</button>
          <button type="button" disabled={props.shareBusy} onClick={() => invoke(props.onShare)}>{props.shareBusy ? '生成分享图中…' : '生成分享图'}</button>
          <button type="button" disabled={props.busy} onClick={() => invoke(props.onRecovery)}>恢复历史版本</button>
          <p className="menu-note">资料保存在当前浏览器。请将备份下载后妥善保管。</p>
        </div>
      </details>
      <label className="search"><span className="sr-only">搜索人物</span>
        <input value={props.query} onChange={(event) => props.setQuery(event.target.value)} placeholder="搜索家人、籍贯或经历" aria-label="搜索人物" />
        {props.query && <button type="button" className="text-button" onClick={() => props.setQuery('')} aria-label="清除搜索">清除</button>}
      </label>
      <span className={`save-pill save-${props.saveStatus}`} role="status" title={`${props.saveStatusLabel} · ${props.toast}`}>
        <span className="status-dot" aria-hidden="true" />
        {props.saveStatus === 'saved' ? '已保存到本浏览器' : props.saveStatusLabel}
      </span>
      <button type="button" className="primary add-person" aria-label="添加家人" disabled={props.busy} onClick={props.onAddPerson}>添加家人</button>
    </header>
  )
}

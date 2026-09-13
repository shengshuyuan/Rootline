import { lazy, Suspense, useRef, useState, type ChangeEvent } from 'react'
import './styles.css'
import {
  addParentChildRelationship,
  addPartnerRelationship,
  addPerson,
  attachChildToParentUnit,
  createEmptyFamilyTree,
  deletePerson,
  getDeletionImpact,
  removeParentChildRelationship,
  removePartnerRelationship,
  updateFamilyTreeMeta,
  updatePerson,
} from './domain'
import {
  importAndReplace,
  MAX_IMPORT_BYTES,
  downloadFamilyTreeWorkbook,
  downloadFamilyTreeTemplate,
  parseFamilyTreeWorkbook,
  parseFamilyTreeJson,
  stringifyFamilyTree,
  summarizeFamilyTree,
  type FamilyTreeSummary,
} from './io'
import type { FamilyTreeRepository } from './repository'
import type { FamilyTree, RecoveryPoint } from './types'
import { blankPersonDraft, type PersonDraft, type RelationKind } from './types/draft'
import { FamilyWorkspace } from './components/FamilyWorkspace'
import { useFamilyView } from './hooks/useFamilyView'
import { PersonDetails } from './components/panels/PersonDetails'
import { AppToolbar } from './components/AppToolbar'
import { useTreeStorage } from './hooks/useTreeStorage'
import { defaultGenderForRelation } from './utils/relationDefaults'
import { issuesFromUnknown, mapValidationIssues, type PersonFieldKey } from './utils/formErrors'
import {
  dismissBackupBanner,
  markExported,
} from './utils/backupReminder'
import { FamilyTreeValidationError } from './validation'
import { createFamilyShareImage, shareImageOrDownload } from './io/shareImage'

const PersonDialog = lazy(() => import('./components/forms/PersonDialog').then((module) => ({ default: module.PersonDialog })))
const LinkDialog = lazy(() => import('./components/forms/LinkDialog').then((module) => ({ default: module.LinkDialog })))
const ConfirmDialog = lazy(() => import('./components/forms/ConfirmDialog').then((module) => ({ default: module.ConfirmDialog })))
const ImportDialog = lazy(() => import('./components/forms/ImportDialog').then((module) => ({ default: module.ImportDialog })))
const SettingsDialog = lazy(() => import('./components/forms/SettingsDialog').then((module) => ({ default: module.SettingsDialog })))
const RecoveryDialog = lazy(() => import('./components/forms/RecoveryDialog').then((module) => ({ default: module.RecoveryDialog })))

type Dialog = 'person' | 'link' | 'delete' | 'import' | 'settings' | 'recovery' | null
interface AppProps {
  repository: FamilyTreeRepository
}

export default function App({ repository }: AppProps) {
  const {
    ready,
    loadError,
    setLoadError,
    tree,
    toast,
    setToast,
    saveStatus,
    saveStatusLabel,
    backupBanner,
    setBackupBanner,
    editsSinceExport,
    setEditsSinceExport,
    noteSuccessfulWrite,
    save,
    reloadLatest,
  } = useTreeStorage(repository)
  const {
    selectedId, setSelectedId, selected, center, setCenter, mode, setMode,
    collapsed, setCollapsed, query, setQuery, focusPersonId, setFocusPersonId,
    graph, locatePerson,
  } = useFamilyView(tree)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [kind, setKind] = useState<RelationKind>('child')
  const [draft, setDraft] = useState<PersonDraft>(blankPersonDraft())
  const [editing, setEditing] = useState(false)
  const [linkId, setLinkId] = useState('')
  const [importText, setImportText] = useState('')
  const [importSummary, setImportSummary] = useState<FamilyTreeSummary | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [importBusy, setImportBusy] = useState(false)
  const [excelImport, setExcelImport] = useState<FamilyTree | null>(null)
  const [shareBusy, setShareBusy] = useState(false)
  const [shareNotice, setShareNotice] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<PersonFieldKey, string>>>({})
  const [formErrors, setFormErrors] = useState<string[]>([])
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const [recoveryPoints, setRecoveryPoints] = useState<RecoveryPoint[]>([])
  const [recoveryError, setRecoveryError] = useState<string | null>(null)
  const [recoveryBusy, setRecoveryBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  /** Restore focus to the control that opened the last dialog (a11y). */
  const returnFocusRef = useRef<HTMLElement | null>(null)

  const rememberFocus = () => {
    const active = document.activeElement
    if (active instanceof HTMLElement) returnFocusRef.current = active
  }

  const restoreFocus = () => {
    const target = returnFocusRef.current
    returnFocusRef.current = null
    queueMicrotask(() => target?.focus())
  }

  const close = () => {
    setDialog(null)
    setEditing(false)
    setDraft(blankPersonDraft())
    setImportText('')
    setImportSummary(null)
    setImportError(null)
    setExcelImport(null)
    setLinkId('')
    setFieldErrors({})
    setFormErrors([])
    setSettingsError(null)
    setRecoveryError(null)
    restoreFocus()
  }

  const openImport = () => {
    rememberFocus()
    setImportText('')
    setImportSummary(null)
    setImportError(null)
    setExcelImport(null)
    setDialog('import')
  }

  const refreshRecoveryPoints = async () => {
    const points = await repository.listRecoveryPoints?.() ?? []
    setRecoveryPoints(points)
  }

  const openRecovery = async () => {
    rememberFocus()
    setDialog('recovery')
    setRecoveryError(null)
    setRecoveryBusy(true)
    try {
      await refreshRecoveryPoints()
    } catch (error) {
      setRecoveryError(issuesFromUnknown(error, '无法读取恢复点').join('；'))
    } finally {
      setRecoveryBusy(false)
    }
  }

  const createManualRecovery = async () => {
    setRecoveryBusy(true)
    setRecoveryError(null)
    try {
      const point = await repository.createRecoveryPoint?.('manual')
      if (!point) throw new Error('当前没有可保存的族谱数据')
      await refreshRecoveryPoints()
      setToast('已保存手动恢复点')
    } catch (error) {
      setRecoveryError(issuesFromUnknown(error, '恢复点保存失败').join('；'))
    } finally {
      setRecoveryBusy(false)
    }
  }

  const restoreRecoveryPoint = async (id: string) => {
    if (!repository.restoreRecoveryPoint) return
    setRecoveryBusy(true)
    setRecoveryError(null)
    try {
      const restored = await repository.restoreRecoveryPoint(id)
      setLoadError(null)
      setCenter(restored.rootPersonId)
      setSelectedId(null)
      setCollapsed(new Set())
      noteSuccessfulWrite(restored, '已恢复历史版本')
      close()
    } catch (error) {
      setRecoveryError(issuesFromUnknown(error, '恢复失败').join('；'))
    } finally {
      setRecoveryBusy(false)
    }
  }

  const downloadRawRecovery = async () => {
    try {
      const raw = await repository.readRawForRecovery?.()
      if (!raw) throw new Error('没有可导出的原始数据')
      const url = URL.createObjectURL(new Blob([JSON.stringify(raw, null, 2)], { type: 'application/json' }))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `rootline_raw_recovery_${new Date().toISOString().slice(0, 10)}.json`
      anchor.click()
      URL.revokeObjectURL(url)
      setToast('已导出原始恢复数据')
    } catch (error) {
      setToast(`原始数据导出失败：${issuesFromUnknown(error, '未知错误').join('；')}`)
    }
  }

  const openCreate = (relation: RelationKind) => {
    if (relation === 'child' && selected?.gender === 'unknown') {
      setToast('请先为当前人物补充性别（男性/女性）后再添加子女')
      return
    }
    rememberFocus()
    setKind(relation)
    setEditing(false)
    setFieldErrors({})
    setFormErrors([])
    setDraft({
      ...blankPersonDraft(),
      gender: defaultGenderForRelation(relation, selected?.gender),
    })
    setDialog('person')
  }

  const selectPerson = (personId: string) => setSelectedId(personId)

  const setAsCenter = (personId: string) => {
    setCenter(personId)
    setSelectedId(personId)
    setFocusPersonId(personId)
    setToast('已设为画布中心')
  }

  const submitPerson = async () => {
    const local: typeof fieldErrors = {}
    if (!draft.name.trim()) local.name = '请填写姓名'
    if (draft.gender === 'unknown') local.gender = '请选择男性或女性'
    setFieldErrors(local)
    setFormErrors([])
    if (Object.keys(local).length) return

    try {
      let next = tree ?? createEmptyFamilyTree('盛氏家族族谱', { surname: '盛' })
      const ancestralHome = draft.ancestralHome.trim() || undefined
      const occupation = draft.occupation.trim() || undefined
      const biography = draft.biography.trim() || undefined
      const notes = draft.notes.trim() || undefined

      if (editing && selected) {
        next = updatePerson(next, selected.id, {
          name: draft.name,
          gender: draft.gender,
          isDeceased: draft.deceased,
          birth: draft.birth,
          death: draft.deceased ? draft.death : undefined,
          ancestralHome,
          occupation,
          biography,
          notes,
        })
        await save(next, '已保存人物资料')
        close()
        return
      }

      if (kind === 'child' && selected?.gender === 'unknown') {
        setFormErrors(['请先为当前人物补充性别（男性/女性）后再添加子女'])
        return
      }

      const before = next.persons.length
      next = addPerson(next, {
        name: draft.name,
        gender: draft.gender,
        isDeceased: draft.deceased,
        birth: draft.birth,
        death: draft.deceased ? draft.death : undefined,
        ancestralHome,
        occupation,
        biography,
        notes,
      })
      const created = next.persons[before]

      if (kind !== 'standalone' && tree && selected) {
        if (kind === 'spouse') {
          next = addPartnerRelationship(next, {
            person1Id: selected.id,
            person2Id: created.id,
            relationshipType: 'married',
          })
        } else if (kind === 'father' || kind === 'mother') {
          next = addParentChildRelationship(next, {
            parentId: created.id,
            childId: selected.id,
            parentRole: kind,
            relationshipType: 'biological',
          })
        } else {
          next = attachChildToParentUnit(next, selected.id, created.id)
        }
      }

      next = { ...next, rootPersonId: next.rootPersonId ?? created.id }
      await save(next, tree ? '已添加人物' : '已创建第一位成员')
      if (kind === 'spouse' && selected) selectPerson(selected.id)
      else selectPerson(created.id)
      if (kind === 'standalone') {
        setCenter(created.id)
        setFocusPersonId(created.id)
      } else if (!center) {
        setCenter(next.rootPersonId ?? created.id)
      }
      close()
    } catch (error) {
      const issues = issuesFromUnknown(error, '操作失败')
      const mapped = mapValidationIssues(issues)
      setFieldErrors(mapped.fields)
      setFormErrors(mapped.form.length ? mapped.form : issues)
    }
  }

  const linkExisting = async () => {
    if (!tree || !selected || !linkId) {
      setFormErrors(['请选择要关联的人物'])
      return
    }
    if (kind === 'child' && selected.gender === 'unknown') {
      setFormErrors(['请先为当前人物补充性别（男性/女性）后再关联子女'])
      return
    }
    try {
      let next = tree
      if (kind === 'spouse') {
        next = addPartnerRelationship(next, {
          person1Id: selected.id,
          person2Id: linkId,
          relationshipType: 'married',
        })
      } else if (kind === 'father' || kind === 'mother') {
        next = addParentChildRelationship(next, {
          parentId: linkId,
          childId: selected.id,
          parentRole: kind,
          relationshipType: 'biological',
        })
      } else {
        next = attachChildToParentUnit(next, selected.id, linkId)
      }
      await save(next, '已建立关系')
      close()
    } catch (error) {
      setFormErrors(issuesFromUnknown(error, '关联失败'))
    }
  }

  const exportTree = () => {
    if (!tree) return
    try {
      const url = URL.createObjectURL(new Blob([stringifyFamilyTree(tree)], { type: 'application/json' }))
      const anchor = document.createElement('a')
      anchor.href = url
      const safeName = tree.name.replace(/[\\/:*?"<>|]/g, '_')
      anchor.download = `${safeName}_${new Date().toISOString().slice(0, 10)}.json`
      anchor.click()
      URL.revokeObjectURL(url)
      markExported()
      setEditsSinceExport(0)
      setBackupBanner(null)
      setToast('已导出 JSON 备份')
    } catch (error) {
      setToast(`导出失败：${issuesFromUnknown(error, '未知错误').join('；')}`)
    }
  }

  const exportExcel = async () => {
    if (!tree) return
    try {
      const safeName = tree.name.replace(/[\\/:*?"<>|]/g, '_')
      await downloadFamilyTreeWorkbook(tree, `${safeName}_${new Date().toISOString().slice(0, 10)}.xlsx`)
      markExported()
      setEditsSinceExport(0)
      setBackupBanner(null)
      setToast('已导出 Excel 维护表')
    } catch (error) {
      setToast(`Excel 导出失败：${issuesFromUnknown(error, '未知错误').join('；')}`)
    }
  }

  const downloadImportTemplate = async () => {
    try {
      await downloadFamilyTreeTemplate()
      setToast('已下载 Excel 导入模板')
    } catch (error) {
      setToast(`模板下载失败：${issuesFromUnknown(error, '未知错误').join('；')}`)
    }
  }

  const loadImportFile = async (file: File) => {
    if (file.size > MAX_IMPORT_BYTES) {
      setImportError('导入文件不能超过 5 MB')
      return
    }
    try {
      if (/\.xlsx$/i.test(file.name)) {
        const parsed = await parseFamilyTreeWorkbook(await file.arrayBuffer())
        setExcelImport(parsed)
        setImportText('')
        setImportSummary(summarizeFamilyTree(parsed))
        setImportError(null)
        setDialog('import')
        return
      }
      const text = await file.text()
      setExcelImport(null)
      setImportText(text)
      setImportSummary(null)
      setImportError(null)
      setDialog('import')
    } catch (error) {
      setExcelImport(null)
      setImportSummary(null)
      setImportError(issuesFromUnknown(error, 'Excel 解析失败').join('；'))
      setDialog('import')
    }
  }

  const onImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) await loadImportFile(file)
    event.target.value = ''
  }

  const shareTree = async () => {
    if (!tree || shareBusy) return
    setShareBusy(true)
    setShareNotice('正在生成完整家谱分享图…')
    try {
      const image = await createFamilyShareImage(tree)
      const safeName = tree.name.replace(/[\\/:*?"<>|]/g, '_')
      const shared = await shareImageOrDownload(image, `${safeName}_族谱分享图.png`, tree.name)
      const message = shared ? '已打开系统分享面板' : '已下载完整家谱分享图'
      setShareNotice(message)
      setToast(message)
    } catch (error) {
      const message = `分享图生成失败：${issuesFromUnknown(error, '未知错误').join('；')}`
      setShareNotice(message)
      setToast(message)
    } finally {
      setShareBusy(false)
    }
  }

  const previewImport = () => {
    try {
      const parsed = parseFamilyTreeJson(importText)
      setImportSummary(summarizeFamilyTree(parsed))
      setImportError(null)
    } catch (error) {
      setImportSummary(null)
      setImportError(issuesFromUnknown(error, '解析失败').join('；'))
    }
  }

  const confirmImport = async () => {
    setImportBusy(true)
    try {
      const next = excelImport ?? await importAndReplace(repository, importText)
      if (excelImport) {
        if (repository.replaceFromImportWithRecovery) await repository.replaceFromImportWithRecovery(next)
        else {
          await repository.createRecoveryPoint?.('before-import')
          await repository.replaceFromImport(next)
        }
      }
      setCenter(next.rootPersonId)
      setSelectedId(null)
      noteSuccessfulWrite(next, '已导入并替换本地族谱', { remindImport: true })
      close()
    } catch (error) {
      setImportError(issuesFromUnknown(error, '导入失败').join('；'))
    } finally {
      setImportBusy(false)
    }
  }

  if (!ready) {
    return (
      <main className="empty-shell">
        <section className="empty-card">
          <img className="empty-brand-mark" src="/rootline-mark.svg" alt="" width="48" height="48" />
          <p className="eyebrow">ROOTLINE</p>
          <h1>正在读取本地族谱…</h1>
          <p>数据仅保存在当前浏览器中。</p>
        </section>
      </main>
    )
  }

  const importDialog = dialog === 'import' && (
    <Suspense fallback={null}>
      <ImportDialog
      value={importText}
      setValue={(value) => {
        setExcelImport(null)
        setImportText(value)
        setImportSummary(null)
        setImportError(null)
      }}
      summary={importSummary}
      error={importError}
      busy={importBusy}
      onPickFile={() => fileInput.current?.click()}
      onDownloadTemplate={() => { void downloadImportTemplate() }}
      onPreview={previewImport}
      onConfirm={confirmImport}
      onDropFile={(file) => { void loadImportFile(file) }}
      excelSelected={Boolean(excelImport)}
        close={close}
      />
    </Suspense>
  )

  const recoveryDialog = dialog === 'recovery' && (
    <Suspense fallback={null}>
      <RecoveryDialog
        points={recoveryPoints}
        busy={recoveryBusy}
        error={recoveryError}
        close={close}
        restore={(id) => { void restoreRecoveryPoint(id) }}
        createManual={() => { void createManualRecovery() }}
      />
    </Suspense>
  )

  const hiddenFile = (
    <input
      hidden
      ref={fileInput}
      type="file"
      accept="application/json,.json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx"
      onChange={onImportFile}
    />
  )

  if (loadError) {
    return (
      <main className="empty-shell recovery-shell">
        <section className="empty-card recovery-card" role="alert">
          <img className="empty-brand-mark" src="/rootline-mark.svg" alt="" width="48" height="48" />
          <p className="eyebrow">ROOTLINE · 数据恢复</p>
          <h1>本地族谱暂时无法读取</h1>
          <p>{loadError}</p>
          <p>原始数据仍保留在此浏览器中。你可以先导出原始副本，或从最近的恢复点恢复。</p>
          <div className="actions">
            <button type="button" className="primary" onClick={() => { void downloadRawRecovery() }}>导出原始数据</button>
            <button type="button" onClick={() => { void openRecovery() }}>查看恢复点</button>
            <button type="button" onClick={() => window.location.reload()}>重新读取</button>
          </div>
        </section>
        {recoveryDialog}
      </main>
    )
  }

  if (!tree) {
    return (
      <main className="empty-shell">
        {hiddenFile}
        <section className="empty-card">
          <img className="empty-brand-mark" src="/rootline-mark.svg" alt="" width="48" height="48" />
          <p className="eyebrow">ROOTLINE · 本地族谱</p>
          <h1>从一位家人开始，<br />续写家族的脉络。</h1>
          <p>人物与关系仅保存在本浏览器。可创建首位成员，或导入已有 JSON / Excel。</p>
          <div className="actions">
            <button type="button" className="primary" onClick={() => openCreate('standalone')}>创建第一位成员</button>
            <button type="button" onClick={openImport}>导入已有族谱</button>
          </div>
          <p className="empty-hint">导入可选择文件、粘贴 JSON，或先下载 Excel 模板填写；确认前会显示人数与关系预览。</p>
        </section>
        {dialog === 'person' && (
          <Suspense fallback={null}>
            <PersonDialog
              title="创建第一位成员"
              draft={draft}
              setDraft={setDraft}
              busy={saveStatus === 'saving'}
            recoveryAction={saveStatus === 'error' ? <button type="button" className="text-button" onClick={() => { void reloadLatest().then(() => { close(); setToast('已读取最新版本，请重新打开人物核对并编辑。') }).catch(() => undefined) }}>放弃本次编辑，读取最新版本</button> : undefined}
            submit={submitPerson}
              close={close}
              fieldErrors={fieldErrors}
              formErrors={formErrors}
            />
          </Suspense>
        )}
        {importDialog}
        {recoveryDialog}
      </main>
    )
  }

  const relations = selected
    ? {
        parents: tree.parentChildRelationships.filter((relationship) => relationship.childId === selected.id),
        children: tree.parentChildRelationships.filter((relationship) => relationship.parentId === selected.id),
        spouse: tree.partnerRelationships.filter(
          (relationship) => relationship.person1Id === selected.id || relationship.person2Id === selected.id,
        ),
      }
    : undefined

  return (
    <main className="app-shell">
      {hiddenFile}
      {backupBanner && (
        <div className="backup-banner" role="status">
          <span>{backupBanner}</span>
          <div className="backup-banner-actions">
            <button type="button" className="primary" onClick={exportTree}>导出备份</button>
            <button type="button" onClick={() => { void exportExcel() }}>导出 Excel</button>
            <button
              type="button"
              onClick={() => {
                dismissBackupBanner()
                setBackupBanner(null)
              }}
            >
              稍后
            </button>
          </div>
        </div>
      )}

      <AppToolbar
        name={tree.name}
        saveStatus={saveStatus}
        saveStatusLabel={saveStatusLabel}
        toast={toast}
        query={query}
        setQuery={setQuery}
        shareBusy={shareBusy}
        busy={saveStatus === 'saving' || importBusy || recoveryBusy}
        onSettings={() => { rememberFocus(); setDialog('settings') }}
        onImport={openImport}
        onExportJson={exportTree}
        onExportExcel={() => { void exportExcel() }}
        onShare={() => { void shareTree() }}
        onRecovery={() => { void openRecovery() }}
        onAddPerson={() => openCreate('standalone')}
      />
      {saveStatus === 'error' && <div className="save-error-banner" role="alert">
        <span>{toast}</span>
        <button type="button" onClick={() => { void reloadLatest().then(() => { close(); setToast('已读取最新版本，请重新打开人物核对并编辑。') }).catch(() => undefined) }}>放弃本次编辑，读取最新版本</button>
        <button type="button" onClick={exportTree}>导出当前副本</button>
      </div>}
      <FamilyWorkspace
        tree={tree} graph={graph} selectedId={selectedId} mode={mode} setMode={setMode}
        query={query} setQuery={setQuery} onLocate={locatePerson} onSelect={selectPerson}
        focusPersonId={focusPersonId} collapsed={collapsed}
        onToggleCollapsed={() => {
          if (!selected) return
          setCollapsed((current) => { const next = new Set(current); if (next.has(selected.id)) next.delete(selected.id); else next.add(selected.id); return next })
        }}
        onSetCenter={() => { if (selected) setAsCenter(selected.id) }}
        onExpandAll={() => { setCollapsed(new Set()); setToast('已展开全部分支') }}
        onExport={exportTree} editsSinceExport={editsSinceExport} shareNotice={shareNotice}
      >
        <PersonDetails
          key={selectedId}
          busy={saveStatus === 'saving'}
          tree={tree}
          person={selected}
          parents={relations?.parents}
          children={relations?.children}
          spouse={relations?.spouse}
          collapsed={Boolean(selected && collapsed.has(selected.id))}
          hasCollapsedBranches={collapsed.size > 0}
          onClose={() => setSelectedId(null)}
          onPick={selectPerson}
          onRemoveParentChild={(id) => { void save(removeParentChildRelationship(tree, id), '已解除关系').catch(() => undefined) }}
          onRemovePartner={(id) => { void save(removePartnerRelationship(tree, id), '已解除配偶关系').catch(() => undefined) }}
          onEdit={() => {
            if (!selected) return
            rememberFocus()
            setEditing(true)
            setFieldErrors({})
            setFormErrors([])
            setDraft({
              name: selected.name,
              gender: selected.gender,
              birth: selected.birth,
              death: selected.death,
              deceased: selected.isDeceased,
              ancestralHome: selected.ancestralHome ?? '',
              occupation: selected.occupation ?? '',
              biography: selected.biography ?? '',
              notes: selected.notes ?? '',
            })
            setDialog('person')
          }}
          onAddRelation={openCreate}
          onLinkExisting={() => {
            rememberFocus()
            setFormErrors([])
            setKind('child')
            setLinkId('')
            setDialog('link')
          }}
          onToggleCollapsed={() => {
            if (!selected) return
            setCollapsed((current) => {
              const next = new Set(current)
              if (next.has(selected.id)) {
                next.delete(selected.id)
                setToast('已展开子孙')
              } else {
                next.add(selected.id)
                setToast('已折叠子孙')
              }
              return next
            })
          }}
          onSetCenter={() => { if (selected) setAsCenter(selected.id) }}
          onExpandAll={() => { setCollapsed(new Set()); setToast('已展开全部分支') }}
          onDelete={() => { rememberFocus(); setDialog('delete') }}
        />
      </FamilyWorkspace>

      {dialog === 'person' && (
        <Suspense fallback={null}>
          <PersonDialog
            title={
              editing
                ? '编辑人物资料'
                : kind === 'spouse'
                  ? '添加配偶'
                  : kind === 'standalone'
                    ? tree ? '添加独立人物' : '创建第一位成员'
                    : kind === 'father'
                    ? '添加父亲'
                    : kind === 'mother'
                      ? '添加母亲'
                      : '添加子女'
            }
            draft={draft}
            setDraft={setDraft}
            busy={saveStatus === 'saving'}
            recoveryAction={saveStatus === 'error' ? <button type="button" className="text-button" onClick={() => { void reloadLatest().then(() => { close(); setToast('已读取最新版本，请重新打开人物核对并编辑。') }).catch(() => undefined) }}>放弃本次编辑，读取最新版本</button> : undefined}
            submit={submitPerson}
            close={close}
            fieldErrors={fieldErrors}
            formErrors={formErrors}
          />
        </Suspense>
      )}
      {dialog === 'link' && selected && (
        <Suspense fallback={null}>
          <LinkDialog
            tree={tree}
            selectedId={selected.id}
            kind={kind}
            setKind={setKind}
            linkId={linkId}
            setLinkId={setLinkId}
            close={close}
            submit={linkExisting}
            formErrors={formErrors}
          />
        </Suspense>
      )}
      {dialog === 'delete' && selected && (
        <Suspense fallback={null}>
          <ConfirmDialog
            name={selected.name}
            relations={
              getDeletionImpact(tree, selected.id).parentChildRelationships.length
              + getDeletionImpact(tree, selected.id).partnerRelationships.length
            }
            close={close}
            submit={async () => {
              try {
                await repository.createRecoveryPoint?.('before-delete')
                await save(deletePerson(tree, selected.id), '已删除人物')
                setSelectedId(null)
                close()
              } catch { /* handled */ }
            }}
          />
        </Suspense>
      )}
      {dialog === 'settings' && (
        <Suspense fallback={null}>
          <SettingsDialog
            name={tree.name}
            surname={tree.surname}
            error={settingsError}
            close={close}
            submit={async ({ name, surname }) => {
              try {
                setSettingsError(null)
                const next = updateFamilyTreeMeta(tree, { name, surname })
                await save(next, '已更新族谱信息')
                close()
              } catch (error) {
                if (error instanceof FamilyTreeValidationError) setSettingsError(error.message)
                else setSettingsError(issuesFromUnknown(error, '保存失败').join('；'))
              }
            }}
          />
        </Suspense>
      )}
      {importDialog}
      {recoveryDialog}
    </main>
  )
}

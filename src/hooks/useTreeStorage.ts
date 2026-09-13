import { useEffect, useRef, useState } from 'react'
import type { FamilyTreeRepository } from '../repository'
import type { FamilyTree } from '../types'
import { FamilyTreeValidationError } from '../validation'
import { issuesFromUnknown } from '../utils/formErrors'
import { markEditAndShouldRemind, readEditsSinceExport } from '../utils/backupReminder'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

function formatSavedAt(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function useTreeStorage(repository: FamilyTreeRepository) {
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tree, setTree] = useState<FamilyTree | null>(null)
  const [toast, setToast] = useState('正在读取本地族谱…')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const [backupBanner, setBackupBanner] = useState<string | null>(null)
  const [editsSinceExport, setEditsSinceExport] = useState(0)
  const saveInFlight = useRef(false)

  useEffect(() => {
    setEditsSinceExport(readEditsSinceExport())
    repository.load()
      .then((saved) => {
        setTree(saved)
        if (saved) {
          setLastSavedAt(saved.updatedAt)
          setSaveStatus('saved')
          setToast('已恢复本地族谱')
        } else {
          setToast('数据仅保存在此设备')
        }
      })
      .catch((error) => {
        const message = issuesFromUnknown(error, '本地数据读取失败').join('；')
        setLoadError(message)
        setToast(`本地数据读取失败：${message}`)
        setSaveStatus('error')
      })
      .finally(() => setReady(true))
  }, [repository])

  const reloadLatest = async () => {
    try {
      const latest = await repository.load()
      setTree(latest)
      setLastSavedAt(latest?.updatedAt ?? null)
      setSaveStatus('saved')
      setToast('已读取最新版本，未提交的草稿仍保留')
    } catch (error) {
      setSaveStatus('error')
      setToast(`读取失败：${issuesFromUnknown(error, '未知错误').join('；')}`)
      throw error
    }
  }

  const noteSuccessfulWrite = (next: FamilyTree, message: string, options?: { remindImport?: boolean }) => {
    setTree(next)
    setLastSavedAt(next.updatedAt)
    setSaveStatus('saved')
    setToast(message)
    setEditsSinceExport((current) => {
      const { next: edits, remind } = markEditAndShouldRemind(current)
      if (options?.remindImport) {
        setBackupBanner('导入成功。数据仅在此浏览器，请尽快导出一份 JSON 备份。')
      } else if (remind || edits === 1) {
        setBackupBanner(edits === 1
          ? '已开始录入。建议导出 JSON 备份，避免浏览器清理后丢失。'
          : `已连续编辑 ${edits} 次，建议导出 JSON 备份。`)
      }
      return edits
    })
  }

  const save = async (next: FamilyTree, message = '已保存到此设备', options?: { remindImport?: boolean }) => {
    if (saveInFlight.current) throw new FamilyTreeValidationError(['正在保存，请稍候'])
    saveInFlight.current = true
    setSaveStatus('saving')
    try {
      await repository.save(next)
      noteSuccessfulWrite(next, message, options)
    } catch (error) {
      setSaveStatus('error')
      setToast(`保存失败：${issuesFromUnknown(error, '未知错误').join('；')}`)
      throw error
    } finally {
      saveInFlight.current = false
    }
  }

  const saveStatusLabel = saveStatus === 'saving'
    ? '保存中…'
    : saveStatus === 'error'
      ? '保存失败'
      : saveStatus === 'saved' && lastSavedAt
        ? `已保存 ${formatSavedAt(lastSavedAt)}`
        : saveStatus === 'saved' ? '已保存' : toast

  return {
    ready,
    reloadLatest,
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
  }
}

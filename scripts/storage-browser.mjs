/**
 * Production IndexedDB storage contract check.
 * Usage: node scripts/storage-browser.mjs
 * Expects Vite dev server at http://127.0.0.1:4174.
 */
import { chromium } from 'playwright'
import { existsSync } from 'node:fs'
import { waitForServer } from './browser-test-helpers.mjs'

const BASE = process.env.ROOTLINE_URL ?? 'http://127.0.0.1:4174'
const SYSTEM_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

async function launchBrowser() {
  try {
    return await chromium.launch()
  } catch (error) {
    if (!existsSync(SYSTEM_CHROME)) throw error
    return chromium.launch({ executablePath: SYSTEM_CHROME })
  }
}

async function main() {
  await waitForServer(BASE)
  const browser = await launchBrowser()
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    await page.goto(`${BASE}/favicon.svg`)
    const checks = await page.evaluate(async () => {
      const [
        repositoryModule,
        fixturesModule,
        importExportModule,
      ] = await Promise.all([
        import('/src/repository/IndexedDbRepository.ts'),
        import('/src/fixtures/index.ts'),
        import('/src/io/importExport.ts'),
      ])
      const { IndexedDbFamilyTreeRepository } = repositoryModule
      const { fourGenerationTree } = fixturesModule
      const { importAndReplace, stringifyFamilyTree } = importExportModule
      const passed = []

      const assert = (condition, message) => {
        if (!condition) throw new Error(message)
        passed.push(message)
      }

      const deleteDatabase = () => new Promise((resolve) => {
        const req = indexedDB.deleteDatabase('rootline')
        req.onsuccess = () => resolve()
        req.onerror = () => resolve()
        req.onblocked = () => resolve()
      })

      const openDatabase = () => new Promise((resolve, reject) => {
        const req = indexedDB.open('rootline')
        req.onerror = () => reject(req.error ?? new Error('failed to open rootline IndexedDB'))
        req.onsuccess = () => resolve(req.result)
      })

      const withStore = async (storeName, mode, operation) => {
        const db = await openDatabase()
        try {
          return await new Promise((resolve, reject) => {
            let result
            const tx = db.transaction(storeName, mode)
            const store = tx.objectStore(storeName)
            tx.oncomplete = () => resolve(result)
            tx.onerror = () => reject(tx.error ?? new Error(`transaction error: ${storeName}`))
            tx.onabort = () => reject(tx.error ?? new Error(`transaction aborted: ${storeName}`))
            try {
              const req = operation(store)
              if (req) {
                req.onsuccess = () => {
                  result = req.result
                }
                req.onerror = () => reject(req.error ?? new Error(`request error: ${storeName}`))
              }
            } catch (error) {
              reject(error)
            }
          })
        } finally {
          db.close()
        }
      }

      const readActiveRaw = () => withStore('trees', 'readonly', (store) => store.get('active'))
      const putActiveRaw = (record) => withStore('trees', 'readwrite', (store) => store.put(record))

      await deleteDatabase()

      const firstTab = new IndexedDbFamilyTreeRepository()
      const secondTab = new IndexedDbFamilyTreeRepository()
      assert(await firstTab.load() === null, 'empty database loads as null')
      await firstTab.save(fourGenerationTree)
      let raw = await readActiveRaw()
      assert(raw.revision === 1, 'initial save writes revision 1')

      const firstTree = await firstTab.load()
      const secondTree = await secondTab.load()
      await firstTab.save({ ...firstTree, name: '第一窗口版本' })
      const exportedWhileStale = await secondTab.export()
      assert(exportedWhileStale.name === '第一窗口版本', 'export reads latest active tree without reloading UI state')
      const staleResult = await secondTab.save({ ...secondTree, name: '第二窗口旧版本' })
        .then(() => ({ ok: true }))
        .catch((error) => ({ ok: false, name: error.name, message: error.message }))
      raw = await readActiveRaw()
      assert(!staleResult.ok && staleResult.name === 'StorageConflictError', 'stale save rejects with StorageConflictError')
      assert(raw.name === '第一窗口版本' && raw.revision === 2, 'stale save does not overwrite active tree')
      const staleRecoveryResult = await secondTab.createRecoveryPoint('before-delete')
        .then(() => ({ ok: true }))
        .catch((error) => ({ ok: false, name: error.name, message: error.message }))
      let points = await secondTab.listRecoveryPoints()
      assert(!staleRecoveryResult.ok && staleRecoveryResult.name === 'StorageConflictError', 'stale before-delete recovery point rejects with StorageConflictError')
      assert(points.length === 0, 'stale before-delete recovery point does not pollute recovery history')

      const reloaded = await secondTab.load()
      await secondTab.save({ ...reloaded, description: '重新载入后保存' })
      raw = await readActiveRaw()
      assert(raw.description === '重新载入后保存' && raw.revision === 3, 'reload advances stale writer to latest revision')

      await importAndReplace(secondTab, stringifyFamilyTree({ ...fourGenerationTree, name: '导入成功版本' }))
      raw = await readActiveRaw()
      points = await secondTab.listRecoveryPoints()
      assert(raw.name === '导入成功版本' && raw.revision === 4, 'atomic import replaces active tree and bumps revision')
      assert(points.length === 1 && points[0].reason === 'before-import', 'atomic import creates one before-import recovery point')

      const beforeFailedImport = structuredClone(raw)
      const beforeFailedPointCount = points.length
      const originalPut = IDBObjectStore.prototype.put
      IDBObjectStore.prototype.put = function patchedPut(value, ...args) {
        if (this.name === 'trees' && value?.key === 'active' && value?.name === '导入失败版本') {
          throw new DOMException('simulated active tree put failure', 'AbortError')
        }
        return originalPut.call(this, value, ...args)
      }
      try {
        const failedImport = await importAndReplace(
          secondTab,
          stringifyFamilyTree({ ...fourGenerationTree, name: '导入失败版本' }),
        )
          .then(() => ({ ok: true }))
          .catch((error) => ({ ok: false, name: error.name, message: error.message }))
        assert(!failedImport.ok, 'injected active tree put failure rejects import')
      } finally {
        IDBObjectStore.prototype.put = originalPut
      }
      raw = await readActiveRaw()
      points = await secondTab.listRecoveryPoints()
      assert(raw.name === beforeFailedImport.name && raw.revision === beforeFailedImport.revision, 'failed atomic import keeps active tree unchanged')
      assert(points.length === beforeFailedPointCount, 'failed atomic import rolls back staged recovery point')

      const legacyTree = { ...fourGenerationTree, name: '旧数据无版本' }
      await putActiveRaw({ ...structuredClone(legacyTree), key: 'active' })
      const legacyLoaded = await secondTab.load()
      assert(legacyLoaded.name === '旧数据无版本', 'legacy active tree without revision loads')
      await secondTab.save({ ...legacyLoaded, name: '旧数据升级后保存' })
      raw = await readActiveRaw()
      assert(raw.name === '旧数据升级后保存' && raw.revision === 1, 'legacy active tree upgrades to revision 1 on first save')
      const exported = await secondTab.export()
      assert(!('revision' in exported) && !('key' in exported), 'export strips internal storage metadata')

      const recoveryPoint = await secondTab.createRecoveryPoint('manual')
      assert(Boolean(recoveryPoint?.id), 'manual recovery point exists before corrupt active restore test')
      await putActiveRaw({ key: 'active', revision: 10, name: '', schemaVersion: '1.0.0' })
      const corruptLoad = await secondTab.load()
        .then(() => ({ ok: true }))
        .catch((error) => ({ ok: false, name: error.name, message: error.message }))
      assert(!corruptLoad.ok, 'corrupt active tree fails to load')
      const restored = await secondTab.restoreRecoveryPoint(recoveryPoint.id)
      raw = await readActiveRaw()
      assert(restored.name === '旧数据升级后保存' && raw.revision === 11, 'restore succeeds after corrupt load observes active revision')

      return passed
    })

    checks.forEach((check) => console.log(`✓ ${check}`))
    console.log('STORAGE_BROWSER OK')
  } finally {
    await context.close()
    await browser.close()
  }
}

main().catch((error) => {
  console.error('STORAGE_BROWSER FAIL', error)
  process.exit(1)
})

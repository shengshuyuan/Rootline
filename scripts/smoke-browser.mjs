/**
 * Playwright smoke: empty → first person → spouse → two children → edit date → reload.
 * Usage: node scripts/smoke-browser.mjs
 * Expects `npm run build && npx vite preview --port 4173` already running,
 * or starts preview itself after build if ROOTLINE_SMOKE_START=1.
 */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fillFirstField, openRelativeAction, pick, savePerson, waitForServer } from './browser-test-helpers.mjs'

const BASE = process.env.ROOTLINE_URL ?? 'http://127.0.0.1:4173'
const START = process.env.ROOTLINE_SMOKE_START === '1'

async function main() {
  let child
  if (START) {
    child = spawn('./node_modules/.bin/vite', ['preview', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], {
      stdio: 'ignore',
    })
  }
  try {
    await waitForServer(BASE)
    const browser = await chromium.launch()
    const page = await browser.newPage()
    await page.goto(BASE)
    await page.evaluate(() => new Promise((resolve) => {
      const req = indexedDB.deleteDatabase('rootline')
      req.onsuccess = () => resolve()
      req.onerror = () => resolve()
      req.onblocked = () => resolve()
    }))
    await page.reload()
    await page.waitForTimeout(400)

    // Create first person
    await page.getByRole('button', { name: '创建第一位成员' }).click()
    await fillFirstField(page, '盛甲')
    await page.locator('.gender-card', { hasText: '男性' }).click()
    await savePerson(page)

    // Spouse (defaults female for male)
    await openRelativeAction(page, '添加配偶')
    await fillFirstField(page, '王乙')
    await savePerson(page, 400)

    // Two children
    await pick(page, '盛甲')
    await openRelativeAction(page, '添加子女')
    await fillFirstField(page, '盛丙')
    await savePerson(page, 400)
    await pick(page, '盛甲')
    await openRelativeAction(page, '添加子女')
    await fillFirstField(page, '盛丁')
    await savePerson(page)

    // Edit date
    await pick(page, '盛甲')
    await page.getByRole('button', { name: '编辑资料' }).click()
    const selects = page.locator('.date-selects select')
    await selects.nth(0).selectOption('1980')
    await selects.nth(1).selectOption('05')
    await selects.nth(2).selectOption('12')
    await savePerson(page)

    // Reload restore
    await page.reload()
    await page.waitForTimeout(800)
    await expectText(page, '盛甲')
    await expectText(page, '王乙')
    await expectText(page, '盛丙')
    await expectText(page, '盛丁')
    await pick(page, '盛甲')
    await expectText(page, '1980-05-12')

    await browser.close()
    console.log('SMOKE OK')
  } finally {
    if (child) child.kill('SIGTERM')
  }
}

async function expectText(page, text) {
  const body = await page.locator('body').innerText()
  if (!body.includes(text)) throw new Error(`Missing text on page: ${text}`)
}

main().catch((error) => {
  console.error('SMOKE FAIL', error)
  process.exit(1)
})

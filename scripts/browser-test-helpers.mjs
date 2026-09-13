import { setTimeout as sleep } from 'node:timers/promises'

export async function waitForServer(url, attempts = 50) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url)
      if (res.ok || res.status === 404) return
    } catch {
      /* retry */
    }
    await sleep(250)
  }
  throw new Error(`Server not ready: ${url}`)
}

export function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

export async function wipe(page) {
  await page.evaluate(() => new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('rootline')
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
    req.onblocked = () => resolve()
  }))
  await page.evaluate(() => {
    localStorage.removeItem('rootline.editsSinceExport')
    localStorage.removeItem('rootline.backupBannerDismissedAt')
  })
  await page.reload()
  await page.waitForTimeout(500)
}

export async function fillFirstField(page, value) {
  await page.locator('.dialog-body .field input').first().fill(value)
}

export async function savePerson(page, delay = 500) {
  await page.getByRole('button', { name: '保存人物' }).click()
  await page.waitForTimeout(delay)
}

export async function waitForBodyText(page, text, timeout = 5000) {
  await page.waitForFunction(
    (expected) => document.body.innerText.includes(expected),
    text,
    { timeout },
  )
}

export async function waitForSaved(page, timeout = 5000) {
  await page.waitForFunction(
    () => document.body.innerText.includes('已保存到本浏览器'),
    undefined,
    { timeout },
  )
}

export async function waitForDialogClosed(page, timeout = 5000) {
  await page.waitForFunction(
    () => !document.querySelector('.dialog'),
    undefined,
    { timeout },
  )
}

export async function waitForStoredPerson(page, name, timeout = 5000) {
  await page.waitForFunction(
    (expectedName) => new Promise((resolve) => {
      const open = indexedDB.open('rootline')
      open.onerror = () => resolve(false)
      open.onsuccess = () => {
        const db = open.result
        const tx = db.transaction('trees', 'readonly')
        const req = tx.objectStore('trees').get('active')
        req.onerror = () => resolve(false)
        req.onsuccess = () => resolve(Boolean(req.result?.persons?.some((person) => person.name === expectedName)))
      }
    }),
    name,
    { timeout },
  )
}

export async function closeAnyModal(page) {
  if (await page.locator('.dialog').count()) {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)
  }
  if (await page.locator('.dialog').count()) {
    await page.getByRole('button', { name: '取消' }).click().catch(() => {})
    await page.waitForTimeout(200)
  }
}

async function clickFirstVisible(locator) {
  const count = await locator.count()
  for (let i = 0; i < count; i += 1) {
    const item = locator.nth(i)
    if (await item.isVisible().catch(() => false)) {
      await item.click()
      return true
    }
  }
  return false
}

async function openFamilyDirectory(page) {
  if (await page.locator('.person-link').first().isVisible().catch(() => false)) return true

  const directoryButton = page.getByRole('button', { name: /家人名录|人物名录|快速定位/ })
  if (await clickFirstVisible(directoryButton)) {
    await page.waitForTimeout(150)
    return true
  }

  const directorySummary = page.locator('summary').filter({ hasText: /家人名录|人物名录|快速定位/ })
  if (await clickFirstVisible(directorySummary)) {
    await page.waitForTimeout(150)
    return true
  }

  return false
}

export async function pick(page, name) {
  await closeAnyModal(page)

  const node = page.locator('.person-card strong', { hasText: name }).first()
  if (await node.isVisible().catch(() => false)) {
    await node.click()
    await page.waitForTimeout(250)
    return
  }

  const search = page.getByLabel('搜索人物').first()
  if (await search.isVisible().catch(() => false)) {
    await search.fill(name)
    await page.waitForTimeout(150)
    const result = page.locator('.search-results button', { hasText: name }).first()
    if (await result.isVisible().catch(() => false)) {
      await result.click()
      await page.waitForTimeout(250)
      await search.fill('')
      return
    }
  }

  await openFamilyDirectory(page)
  const link = page.locator('.person-link', { hasText: name }).first()
  if (await link.isVisible().catch(() => false)) {
    await link.click()
    await page.waitForTimeout(250)
    return
  }

  throw new Error(`Cannot pick person: ${name}`)
}

export async function clickAddPerson(page) {
  const buttons = [
    page.getByRole('button', { name: '+ 添加人物', exact: true }),
    page.getByRole('button', { name: '添加家人', exact: true }),
    page.getByRole('button', { name: /添加人物|添加家人/ }),
  ]

  for (const button of buttons) {
    if (await clickFirstVisible(button)) return
  }

  throw new Error('Cannot find add-person action')
}

export async function openSupplementalFields(page) {
  const biography = page.getByLabel(/个人简介/)
  if (await biography.isVisible().catch(() => false)) return

  const trigger = page.getByRole('button', { name: '补充资料', exact: true })
  if (await clickFirstVisible(trigger)) {
    await page.waitForTimeout(150)
    return
  }

  const toggle = page.locator('.person-extra-toggle').filter({ hasText: '补充资料' })
  if (await clickFirstVisible(toggle)) {
    await page.waitForTimeout(150)
    return
  }

  throw new Error('Cannot open supplemental fields')
}

export async function openRelativeAction(page, actionName) {
  const direct = page.getByRole('button', { name: actionName, exact: true })
  if (await clickFirstVisible(direct)) return

  const relationTab = page.getByRole('tab', { name: /亲属|关系/ })
  if (await clickFirstVisible(relationTab)) {
    await page.waitForTimeout(150)
    if (await clickFirstVisible(direct)) return
  }

  const relationTriggers = [
    page.getByRole('button', { name: '添加亲属', exact: true }),
    page.locator('summary').filter({ hasText: '添加亲属' }),
    page.locator('details').filter({ hasText: /添加亲属|增加关系/ }).locator('summary').first(),
  ]

  for (const trigger of relationTriggers) {
    if (await clickFirstVisible(trigger)) {
      await page.waitForTimeout(150)
      if (await clickFirstVisible(direct)) return
    }
  }

  throw new Error(`Cannot find relative action: ${actionName}`)
}

export async function openRelationTab(page) {
  const relationTab = page.getByRole('tab', { name: /亲属|关系/ })
  if (await clickFirstVisible(relationTab)) {
    await page.waitForTimeout(150)
  }
}

export async function clickDataAction(page, name) {
  const menu = page.locator('details.toolbar-menu.desktop-toolbar-control')
  if (await menu.count()) {
    await menu.locator('summary').click()
    await menu.getByRole('button', { name, exact: true }).click()
    return
  }

  const summary = page.locator('details').filter({ hasText: /数据|族谱/ }).locator('summary').first()
  if (await summary.isVisible().catch(() => false)) {
    await summary.click()
    await page.getByRole('button', { name, exact: true }).click()
    return
  }

  throw new Error(`Cannot find data action: ${name}`)
}

export async function openSettings(page) {
  if (await clickFirstVisible(page.getByRole('button', { name: '设置', exact: true }))) return
  await clickDataAction(page, '族谱设置')
}

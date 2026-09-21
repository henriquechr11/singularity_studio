import { test, expect } from '@playwright/test'

const pulsarCanvas = page => page.locator('.pulsar-canvas-host canvas')

async function openPulsar(page) {
  await page.getByRole('button', { name: /Explorar projeto: PULSAR/ }).first().click()
  await expect(page.locator('.pulsar-dialog')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Pulsar: o farol do cosmos' })).toBeVisible()
  await page.locator('.pulsar-explore').click()
  await expect(page.locator('#pulsar-model-title')).toBeFocused()
  const canvas = pulsarCanvas(page)
  await expect(canvas).toHaveAttribute('data-ready', 'true', { timeout: 30000 })
  await expect(canvas).toHaveAttribute('data-time', /^\d+(\.\d+)?$/)
  await expect.poll(() => canvas.evaluate(element => {
    const rect = element.getBoundingClientRect()
    return rect.top >= 0 && rect.top < innerHeight / 2
  })).toBe(true)
  return canvas
}

async function timeOf(canvas) {
  return Number(await canvas.getAttribute('data-time'))
}

async function expectTimeToAdvance(canvas) {
  const initial = await timeOf(canvas)
  await expect.poll(() => timeOf(canvas)).toBeGreaterThan(initial + 0.02)
}

async function expectTimeToFreeze(page, canvas) {
  // Scene telemetry is sampled periodically; allow the last live sample to settle.
  await page.waitForTimeout(250)
  const pausedTime = await timeOf(canvas)
  await page.waitForTimeout(350)
  expect(await timeOf(canvas)).toBe(pausedTime)
}

test('pulsar desktop: live WebGL, accessible controls, pause and camera interactions', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error' && /shader|glsl|validate_status|program.*link/i.test(message.text())) {
      errors.push(message.text())
    }
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/#projetos')
  const canvas = await openPulsar(page)
  const status = page.locator('.pulsar-status')
  await expect(status).toHaveAttribute('data-paused', 'false')
  await expectTimeToAdvance(canvas)
  await page.locator('.pulsar-pause').click()
  await expect(status).toHaveAttribute('data-paused', 'true')
  await expect(page.locator('.pulsar-pause')).toHaveAttribute('aria-pressed', 'true')
  await expectTimeToFreeze(page, canvas)
  await expect(page.locator('.pulsar-hotspot button')).toHaveCount(3)
  await page.getByRole('button', { name: 'Feixes de radiação', exact: true }).click()
  await expect(page.locator('#pulsar-note-0')).toBeVisible()
  await page.screenshot({ path: 'test-results/pulsar-desktop.png' })

  const sliders = page.getByRole('slider')
  await expect(sliders).toHaveCount(5)
  for (const slider of await sliders.all()) {
    await expect(slider).toHaveAccessibleName(/\S/)
    await expect(slider).toBeEnabled()
    const minimum = await slider.getAttribute('min')
    const maximum = await slider.getAttribute('max')
    await slider.focus()
    await slider.press('Home')
    await expect(slider).toHaveValue(minimum)
    await slider.press('End')
    await expect(slider).toHaveValue(maximum)
    const formattedValue = await slider.getAttribute('aria-valuetext')
    await expect(slider.locator('..').locator('output')).toHaveText(formattedValue)
  }

  const bounds = await canvas.boundingBox()
  expect(bounds.width).toBeGreaterThan(300)
  await page.mouse.move(bounds.x + bounds.width * 0.5, bounds.y + bounds.height * 0.5)
  await page.mouse.down()
  await page.mouse.move(bounds.x + bounds.width * 0.65, bounds.y + bounds.height * 0.6, { steps: 8 })
  await page.mouse.up()
  await page.mouse.wheel(0, -180)
  await page.locator('.pulsar-reset').click()
  await expect(canvas).toHaveAttribute('data-ready', 'true')
  await expectTimeToFreeze(page, canvas)
  await page.locator('.pulsar-pause').click()
  await expect(status).toHaveAttribute('data-paused', 'false')
  await expectTimeToAdvance(canvas)
  await page.locator('.pulsar-facts').scrollIntoViewIfNeeded()
  await expect(page.locator('.pulsar-fact')).toHaveCount(4)
  await expect(page.locator('.pulsar-fact').last()).toHaveClass(/is-visible/)
  await page.screenshot({ path: 'test-results/pulsar-facts.png' })
  await page.locator('.pulsar-top').click()
  await expect.poll(() => page.locator('.pulsar-dialog').evaluate(el => el.scrollTop)).toBe(0)
  await page.screenshot({ path: 'test-results/pulsar-hero.png' })
  await page.keyboard.press('Escape')
  await expect(pulsarCanvas(page)).toHaveCount(0)
  expect(errors).toEqual([])
})

test('standalone landing: three sections, global pause, mobile hero and closing', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/pulsar.html')
  await expect(page.getByRole('heading', { name: 'Pulsar: o farol do cosmos' })).toBeVisible()
  await expect(page.locator('main > section')).toHaveCount(3)
  await page.screenshot({ path: 'test-results/pulsar-standalone-mobile-hero.png' })
  await page.locator('.pulsar-motion').click()
  await expect(page.locator('.pulsar-mount')).toHaveAttribute('data-motion-paused', 'true')
  await page.locator('.pulsar-explore').click()
  const canvas = pulsarCanvas(page)
  await expect(canvas).toHaveAttribute('data-ready', 'true', { timeout: 30000 })
  await canvas.scrollIntoViewIfNeeded()
  await expectTimeToFreeze(page, canvas)
  await page.screenshot({ path: 'test-results/pulsar-standalone-mobile-model.png' })
  await page.locator('.pulsar-fact').last().scrollIntoViewIfNeeded()
  await expect(page.locator('.pulsar-fact').last()).toHaveClass(/is-visible/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.locator('.pulsar-top').click()
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0)
  expect(errors).toEqual([])
})

test('pulsar reduced motion starts paused and reopening releases the previous canvas', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/#projetos')
  let canvas = await openPulsar(page)
  await expect(page.locator('.pulsar-status')).toHaveAttribute('data-paused', 'true')
  await expectTimeToFreeze(page, canvas)
  await page.locator('.pulsar-pause').click()
  await expectTimeToAdvance(canvas)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.locator('.pulsar-status')).toHaveAttribute('data-paused', 'true')
  await expectTimeToFreeze(page, canvas)

  for (let reopening = 0; reopening < 2; reopening++) {
    await page.keyboard.press('Escape')
    await expect(pulsarCanvas(page)).toHaveCount(0)
    canvas = await openPulsar(page)
    await expect(canvas).toHaveCount(1)
    await expect(page.locator('.pulsar-status')).toHaveAttribute('data-paused', 'true')
    await expect(page.locator('.pulsar-reset')).toBeEnabled()
  }
  await page.locator('.pulsar-dialog .dialog-close').click()
  await expect(pulsarCanvas(page)).toHaveCount(0)
  expect(errors).toEqual([])
})

test('pulsar mobile: portrait and landscape keep the scene and controls reachable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#projetos')
  const canvas = await openPulsar(page)
  const dialog = page.locator('.pulsar-dialog')
  await page.screenshot({ path: 'test-results/pulsar-mobile.png' })

  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
    const size = await canvas.boundingBox()
    expect(size.width).toBeGreaterThan(100)
    expect(size.height).toBeGreaterThan(100)
    for (const control of await dialog.locator('input[type="range"], .pulsar-pause, .pulsar-reset').all()) {
      await control.scrollIntoViewIfNeeded()
      await expect(control).toBeInViewport()
      await expect(control).toBeEnabled()
    }
  }
  await page.screenshot({ path: 'test-results/pulsar-mobile-landscape-controls.png' })
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(pulsarCanvas(page)).toHaveCount(0)
})

test('pulsar WebGL unavailable: retry and modal dismissal remain usable', async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return /webgl/.test(type) ? null : getContext.call(this, type, ...args)
    }
  })
  await page.goto('/#projetos')
  await page.getByRole('button', { name: /Explorar projeto: PULSAR/ }).first().click()
  await page.locator('.pulsar-explore').click()
  const dialog = page.locator('.pulsar-dialog')
  const message = dialog.locator('.pulsar-message')
  const retry = message.getByRole('button', { name: 'Tentar novamente' })
  await expect(message).toContainText('A cena 3D')
  await expect(retry).toBeVisible()
  await retry.click()
  await expect(message).toContainText('A cena 3D')
  await expect(retry).toBeEnabled()
  await expect(dialog.locator('.pulsar-pause')).toBeDisabled()
  await expect(dialog.locator('.dialog-close')).toBeEnabled()
  await dialog.locator('.dialog-close').click()
  await expect(dialog).not.toBeVisible()
  await expect(pulsarCanvas(page)).toHaveCount(0)
})

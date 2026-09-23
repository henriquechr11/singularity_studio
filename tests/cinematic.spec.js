import { test, expect } from '@playwright/test'

async function scrollToProgress(page, value) {
  await page.evaluate(p => {
    const top = document.querySelector('.cinematic-intro').offsetHeight * p
    window.dispatchEvent(new CustomEvent('singularity:skip-intro', { detail: top }))
    window.scrollTo({ top, behavior: 'instant' })
  }, value)
  await expect.poll(async () => Number(await page.locator('.intro-stage').getAttribute('data-progress'))).toBeCloseTo(value, 2)
}

test('GLB + Draco, cinematic camera and one-way handoff to the hero', async ({ page }) => {
  const errors = [], requests = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => requests.push(request.url()))
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  const stage = page.locator('.intro-stage')
  await expect(stage).toHaveAttribute('data-mode', 'ready', { timeout: 30000 })
  await expect(page.locator('.intro-canvas')).toHaveCSS('opacity', '1')
  await expect(stage).toHaveCSS('position', 'fixed')
  await expect(page.locator('.site-shell')).toHaveAttribute('inert', '')
  await expect(stage).toHaveAttribute('data-control', 'auto')
  await expect(stage.locator('button, a, p, span, h1, h2')).toHaveCount(0)
  await expect(page.getByRole('link')).toHaveCount(0)
  await expect(page.getByRole('button')).toHaveCount(0)
  expect(await stage.innerText()).toBe('')
  expect(Number(await stage.getAttribute('data-center-x'))).toBeGreaterThan(1)
  expect(await page.locator('.cinematic-intro').evaluate(e => e.offsetHeight / innerHeight)).toBeGreaterThanOrEqual(9.9)
  const initial = Number(await stage.getAttribute('data-distance'))
  expect(initial).toBeLessThan(5.5)
  await expect.poll(async () => Number(await stage.getAttribute('data-distance'))).toBeLessThan(initial - .015)
  await page.screenshot({ path: 'test-results/cinematic-initial.png' })
  // A real wheel event transfers camera control; no pointer or time animation
  // may continue changing its pose once scroll settles.
  await page.mouse.wheel(0, 180)
  await expect(stage).toHaveAttribute('data-control', 'scroll')
  await scrollToProgress(page, .48)
  const wide = Number(await stage.getAttribute('data-distance'))
  expect(wide).toBeGreaterThan(initial * 4)
  expect(Number(await stage.getAttribute('data-center-x'))).toBeCloseTo(.5, 2)
  await page.screenshot({ path: 'test-results/cinematic-wide.png' })
  await scrollToProgress(page, .82)
  expect(Number(await stage.getAttribute('data-distance'))).toBeLessThan(initial)
  expect(Number(await stage.getAttribute('data-fov'))).toBeGreaterThan(68)
  await page.screenshot({ path: 'test-results/cinematic-plunge.png' })
  await scrollToProgress(page, .9)
  expect(Number(await stage.getAttribute('data-distance'))).toBeLessThan(.1)
  await scrollToProgress(page, 1)
  await expect(page.locator('.site-shell')).toHaveAttribute('aria-hidden', 'false')
  await expect(stage).toBeHidden()
  await expect(page.locator('#hero-title')).toBeInViewport()
  await page.screenshot({ path: 'test-results/cinematic-hero.png' })
  const heroTop = await page.locator('.cinematic-intro').evaluate(element => element.offsetHeight)
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await expect.poll(async () => page.evaluate(() => window.scrollY)).toBeCloseTo(heroTop, 0)
  await expect(stage).toBeHidden()
  await expect(page.locator('.site-shell')).toHaveAttribute('aria-hidden', 'false')
  await expect(page.locator('#hero-title')).toBeInViewport()
  expect(requests.some(url => /black_hole\.draco.*\.glb/.test(url))).toBe(true)
  expect(requests.some(url => url.includes('draco_decoder') && url.includes('.wasm'))).toBe(true)
  expect(requests.some(url => /\/black_hole\.glb/.test(url))).toBe(false)
  expect(errors).toEqual([])
})

test('clean intro supports keyboard scroll and Escape without on-screen controls', async ({ page }) => {
  await page.goto('/')
  const stage = page.locator('.intro-stage')
  await expect(stage).toHaveAttribute('data-mode', 'ready', { timeout: 30000 })
  await expect(stage.locator('button, a')).toHaveCount(0)
  await page.keyboard.press('PageDown')
  await expect(stage).toHaveAttribute('data-control', 'scroll')
  await expect.poll(async () => Number(await stage.getAttribute('data-progress'))).toBeGreaterThan(0)
  // Even a large jump in the scroll target must move the camera gradually.
  await page.evaluate(() => {
    const top = document.querySelector('.cinematic-intro').offsetHeight
    window.dispatchEvent(new CustomEvent('singularity:skip-intro', { detail: top }))
    window.scrollTo(0, top)
  })
  await page.waitForTimeout(200)
  expect(Number(await stage.getAttribute('data-progress'))).toBeLessThan(.3)
  await page.keyboard.press('Escape')
  await expect(page.locator('#hero-title')).toBeFocused()
  await expect(stage).toBeHidden()
})

test('hero entrance holds the top until every hero component has entered', async ({ page }) => {
  await page.goto('/')
  const stage = page.locator('.intro-stage')
  const site = page.locator('.site-shell')
  await expect(stage).toHaveAttribute('data-mode', 'ready', { timeout: 30000 })
  await scrollToProgress(page, 1)

  await expect(site).toHaveClass(/site-entering/)
  await expect(page.locator('html')).toHaveClass(/lenis-stopped/)
  const titleLines = page.locator('.hero-copy h1 > span')
  await expect(titleLines).toHaveCount(4)
  const heroTop = await page.locator('.cinematic-intro').evaluate(element => element.offsetHeight)
  await page.mouse.wheel(0, 1200)
  await page.waitForTimeout(250)
  expect(await page.evaluate(() => window.scrollY)).toBeCloseTo(heroTop, 0)

  // The final controls enter last, so a fixed one-second delay must not
  // release scrolling while they are still animating.
  await page.waitForTimeout(350)
  await expect(site).toHaveClass(/site-entering/)
  await expect(site).not.toHaveClass(/site-entering/, { timeout: 1800 })
  await expect(page.locator('html')).not.toHaveClass(/lenis-stopped/)
  // Check the completed entrance independently of the animation library.
  for (const line of await titleLines.all()) {
    await expect(line).toHaveCSS('opacity', '1')
    await expect.poll(() => line.evaluate(element => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform)
      return Math.abs(matrix.m42)
    })).toBeLessThan(.5)
  }
  await expect(page.locator('.hero-visual')).toHaveCSS('opacity', '1')
  await page.mouse.wheel(0, 600)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(heroTop + 50)
})

test('mobile uses reduced effects and survives viewport rotation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const stage = page.locator('.intro-stage')
  await expect(stage).toHaveAttribute('data-mode', 'ready', { timeout: 30000 })
  await expect(stage).toHaveAttribute('data-quality', 'low')
  await expect(page.locator('.intro-canvas')).toHaveCSS('opacity', '1')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/cinematic-mobile.png' })
  await scrollToProgress(page, .48)
  await page.setViewportSize({ width: 844, height: 390 })
  await scrollToProgress(page, .48)
  await expect(page.locator('.intro-canvas')).toHaveJSProperty('width', 844)
  await scrollToProgress(page, 1)
  await expect(page.locator('#hero-title')).toBeInViewport()
})

for (const failure of ['model', 'decoder', 'webgl', 'context']) {
  test(`${failure} failure keeps a static entrance and usable content`, async ({ page }) => {
    if (failure === 'model') await page.route('**/*.glb*', route => route.abort())
    if (failure === 'decoder') await page.route('**/*draco_decoder*.wasm*', route => route.abort())
    if (failure === 'webgl') await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.getContext = function (type, ...args) { return /webgl/.test(type) ? null : original.call(this, type, ...args) }
    })
    await page.goto('/')
    if (failure === 'context') {
      await expect(page.locator('.intro-stage')).toHaveAttribute('data-mode', 'ready', { timeout: 30000 })
      await page.locator('.intro-canvas').evaluate(canvas => canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true })))
    }
    await expect(page.locator('.intro-stage')).toHaveAttribute('data-mode', 'static', { timeout: 30000 })
    await expect(page.locator('.intro-fallback')).toBeVisible()
    await scrollToProgress(page, 1)
    await expect(page.locator('#hero-title')).toBeInViewport()
    await expect(page.locator('.site-shell')).toHaveAttribute('aria-hidden', 'false')
  })
}

test('reduced motion skips the intro and never downloads the GLB', async ({ page }) => {
  const models = []
  page.on('request', request => { if (request.url().includes('.glb')) models.push(request.url()) })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.locator('.intro-stage')).toBeHidden()
  await expect(page.locator('.site-shell')).toHaveAttribute('aria-hidden', 'false')
  await expect(page.locator('#hero-title')).toBeInViewport()
  await expect(page.locator('.cinematic-intro')).toHaveCSS('height', '0px')
  await expect(page.locator('.hole-fallback')).toBeVisible()
  expect(models).toEqual([])
})

test('changing reduced motion during playback reveals accessible content', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.intro-stage')).toHaveAttribute('data-mode', 'ready', { timeout: 30000 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.locator('.intro-stage')).toBeHidden()
  await expect(page.locator('.intro-canvas')).toHaveCount(0)
  await expect(page.locator('.site-shell')).toHaveAttribute('aria-hidden', 'false')
  await expect(page.locator('#hero-title')).toBeInViewport()
})

test('data saver uses a static entrance without fetching the model', async ({ page }) => {
  const models = []
  page.on('request', request => { if (request.url().includes('.glb')) models.push(request.url()) })
  await page.addInitScript(() => Object.defineProperty(navigator, 'connection', { value: { saveData: true } }))
  await page.goto('/')
  await expect(page.locator('.intro-stage')).toHaveAttribute('data-mode', 'static')
  await scrollToProgress(page, 1)
  await expect(page.locator('#hero-title')).toBeInViewport()
  expect(models).toEqual([])
})

test('deep links reach content without replaying the intro', async ({ page }) => {
  await page.goto('/#estudio')
  await expect(page.locator('.site-shell')).toHaveAttribute('aria-hidden', 'false')
  await expect(page.locator('#estudio')).toBeInViewport()
  await expect(page.locator('.intro-stage')).toBeHidden()
  await page.reload()
  await expect(page.locator('#estudio')).toBeInViewport()
})

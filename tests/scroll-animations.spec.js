import { test, expect } from '@playwright/test'

function captureRuntimeErrors(page) {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => {
    if (/hydration|hydrating|server[- ]rendered/i.test(message.text())) errors.push(message.text())
  })
  return errors
}

async function enterSite(page) {
  await page.goto('/')
  await page.locator('.intro-stage').waitFor({ state: 'attached' })
  await page.keyboard.press('Escape')
  await expect(page.locator('.site-shell')).toHaveAttribute('aria-hidden', 'false')
  await expect(page.locator('.site-shell')).not.toHaveClass(/site-entering/)
  await expect(page.locator('#hero-title > span').last()).toHaveCSS('opacity', '1')
}

async function scrollToElement(page, selector, viewportOffset = .15) {
  await page.locator(selector).first().evaluate((element, offset) => {
    const introHeight = document.querySelector('.cinematic-intro')?.offsetHeight || 0
    const top = Math.max(introHeight, element.getBoundingClientRect().top + window.scrollY - innerHeight * offset)
    // Keep Lenis and native scroll in agreement, including instantaneous jumps.
    window.dispatchEvent(new CustomEvent('singularity:skip-intro', { detail: top }))
    window.scrollTo({ top, behavior: 'instant' })
  }, viewportOffset)
  await expect(page.locator(selector).first()).toBeInViewport()
}

async function progressRatio(page) {
  return page.locator('.reading-progress').evaluate(element => element.getBoundingClientRect().width / innerWidth)
}

async function triggerCount(page, selector) {
  return page.evaluate(async scope => {
    const { ScrollTrigger } = await import('/src/animations/gsap.js')
    return ScrollTrigger.getAll().filter(trigger => trigger.trigger?.closest(scope)).length
  }, selector)
}

async function expectRevealed(locator) {
  // The separate card hover animation intentionally offsets y by a few pixels.
  await locator.page().mouse.move(0, 0)
  await expect(locator).toHaveCSS('opacity', '1')
  await expect.poll(() => locator.evaluate(element => {
    const transform = new DOMMatrixReadOnly(getComputedStyle(element).transform)
    return Math.abs(transform.m42)
  })).toBeLessThan(.5)
}

async function expectImageUnmasked(locator) {
  await expect.poll(() => locator.evaluate(element => {
    const clip = getComputedStyle(element).clipPath
    return clip === 'none' || (clip.startsWith('inset(') && [...clip.matchAll(/-?[\d.]+/g)].every(match => Number(match[0]) === 0))
  })).toBe(true)
}

test('desktop scroll reveals content and images while tracking reading progress', async ({ page }) => {
  const errors = captureRuntimeErrors(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await enterSite(page)
  await expect(page.locator('.reading-progress')).toHaveCSS('position', 'fixed')
  await expect.poll(() => progressRatio(page)).toBeLessThan(.02)
  await expect.poll(() => triggerCount(page, '.site-shell')).toBeGreaterThan(0)

  const backdrop = page.locator('.hero-visual .black-hole')
  const initialParallax = await backdrop.evaluate(element => new DOMMatrixReadOnly(getComputedStyle(element).transform).m42)
  await page.mouse.wheel(0, 350)
  await expect.poll(() => backdrop.evaluate(element => new DOMMatrixReadOnly(getComputedStyle(element).transform).m42))
    .not.toBeCloseTo(initialParallax, 0)

  await scrollToElement(page, '.project')
  await expectRevealed(page.locator('.project').first())
  await expectImageUnmasked(page.locator('.project-image-button').first())
  const middleProgress = await progressRatio(page)
  expect(middleProgress).toBeGreaterThan(.02)
  expect(middleProgress).toBeLessThan(.9)

  const words = page.locator('.about-headline [data-scroll-word]')
  await expect(words.first()).toBeAttached()
  await scrollToElement(page, '.about-bottom', .1)
  await expect.poll(() => words.evaluateAll(elements => elements.every(element => Number(getComputedStyle(element).opacity) >= .99))).toBe(true)
  await expect(page.locator('.about-headline h2')).toHaveAccessibleName(/\S/)
  await expectRevealed(page.locator('.about-bottom'))

  await page.evaluate(() => {
    const top = document.documentElement.scrollHeight - innerHeight
    window.dispatchEvent(new CustomEvent('singularity:skip-intro', { detail: top }))
    window.scrollTo({ top, behavior: 'instant' })
  })
  await expectRevealed(page.locator('.footer'))
  await expect.poll(() => progressRatio(page)).toBeGreaterThan(.98)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/scroll-desktop-footer.png' })
  expect(errors).toEqual([])
})

test('new projects, language and accordions stay usable; pause releases scroll effects', async ({ page }) => {
  const errors = captureRuntimeErrors(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await enterSite(page)
  await page.getByRole('button', { name: 'Ver todos os projetos', exact: true }).click()
  await expect(page.locator('.project')).toHaveCount(4)
  await scrollToElement(page, '.project:nth-child(3)')
  for (const card of await page.locator('.project').all()) {
    await card.scrollIntoViewIfNeeded()
    await expectRevealed(card)
    await expectImageUnmasked(card.locator('.project-image-button'))
  }

  await page.getByRole('button', { name: 'EN', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.locator('#hero-title')).toContainText('GRAVITY.')
  await page.locator('.service').last().locator('summary').click()
  await expect(page.locator('.service').last()).toHaveAttribute('open', '')
  await expect(page.locator('.service').first()).not.toHaveAttribute('open', '')
  await expect(page.locator('.service').last().locator('.service-content')).toBeVisible()

  await page.locator('.motion-toggle').click()
  await expect(page.locator('.motion-toggle')).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => triggerCount(page, '.site-shell')).toBe(0)
  await expect.poll(() => page.locator('.site-shell [data-reveal]:visible').evaluateAll(elements =>
    elements.every(element => Number(getComputedStyle(element).opacity) >= .99)
  )).toBe(true)
  for (const image of await page.locator('.project-image-button').all()) await expectImageUnmasked(image)
  await expect(page.locator('.hero-visual .black-hole')).toHaveCSS('transform', 'none')
  await expect(page.locator('.contact')).toBeHidden()
  await expect(page.locator('.faq')).toBeHidden()

  await page.locator('.motion-toggle').click()
  await expect.poll(() => triggerCount(page, '.site-shell')).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Show fewer projects', exact: true }).click()
  await expect(page.locator('.project')).toHaveCount(2)
  await scrollToElement(page, '.footer')
  await expectRevealed(page.locator('.footer'))
  expect(errors).toEqual([])
})

test('mobile layout survives rotation and a reduced-motion change during scrolling', async ({ page }) => {
  const errors = captureRuntimeErrors(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await enterSite(page)
  await scrollToElement(page, '.project')
  await expectRevealed(page.locator('.project').first())
  await expectImageUnmasked(page.locator('.project-image-button').first())
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/scroll-mobile-projects.png' })

  await page.setViewportSize({ width: 844, height: 390 })
  await scrollToElement(page, '#estudio')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect.poll(() => triggerCount(page, '.site-shell')).toBe(0)
  await expect(page.locator('.intro-stage')).toBeHidden()
  await expect(page.locator('.site-shell')).toHaveAttribute('aria-hidden', 'false')
  await expect.poll(() => page.locator('.site-shell [data-reveal]:visible').evaluateAll(elements =>
    elements.every(element => Number(getComputedStyle(element).opacity) >= .99)
  )).toBe(true)
  await page.locator('.service').nth(1).locator('summary').click()
  await expect(page.locator('.service').nth(1).locator('.service-content')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(errors).toEqual([])
})

test('initial reduced motion exposes all content without scroll animation triggers', async ({ page }) => {
  const errors = captureRuntimeErrors(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.locator('.site-shell')).toHaveAttribute('aria-hidden', 'false')
  await expect(page.locator('.intro-stage')).toBeHidden()
  await expect.poll(() => triggerCount(page, '.site-shell')).toBe(0)
  for (const reveal of await page.locator('.site-shell [data-reveal]:visible').all()) await expectRevealed(reveal)
  for (const image of await page.locator('.project-image-button').all()) await expectImageUnmasked(image)
  await expect.poll(() => page.locator('.about-headline [data-scroll-word]').evaluateAll(elements =>
    elements.length > 0 && elements.every(element => Number(getComputedStyle(element).opacity) >= .99)
  )).toBe(true)
  await expect(page.locator('.contact')).toBeHidden()
  await expect(page.locator('.faq')).toBeHidden()
  expect(errors).toEqual([])
})

test('four projects reveal individually in a short mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 400 })
  await page.goto('/#projetos')
  await page.getByRole('button', { name: 'Ver todos os projetos', exact: true }).click()
  await expect(page.locator('.project')).toHaveCount(4)
  for (const card of await page.locator('.project').all()) {
    await card.scrollIntoViewIfNeeded()
    await expectRevealed(card)
    await expectImageUnmasked(card.locator('.project-image-button'))
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/scroll-short-mobile.png' })
})

test('PULSAR counters preserve accessible values and release triggers on close', async ({ page }) => {
  const errors = captureRuntimeErrors(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/#projetos')
  for (let opening = 0; opening < 2; opening++) {
    await page.getByRole('button', { name: /Explorar projeto: PULSAR/ }).first().click()
    const dialog = page.locator('.pulsar-dialog')
    await expect(dialog).toBeVisible()
    await expect.poll(() => triggerCount(page, '.pulsar-mount')).toBeGreaterThan(0)
    for (const value of ['20', '30']) {
      const counter = dialog.locator(`[data-count="${value}"]`)
      await expect(counter.locator('.pulsar-counter-final')).toHaveText(value)
      await expect(counter.locator('.pulsar-counter-value')).toHaveAttribute('aria-hidden', 'true')
      await counter.scrollIntoViewIfNeeded()
      await expect(counter.locator('.pulsar-counter-value')).toHaveText(value)
    }
    await expect(dialog.locator('.pulsar-fact strong').filter({ hasText: '1967' })).toHaveText('1967')
    await dialog.locator('.pulsar-top').click()
    await dialog.locator('.pulsar-motion').click()
    await expect(dialog.locator('.pulsar-mount')).toHaveAttribute('data-motion-paused', 'true')
    await expect.poll(() => triggerCount(page, '.pulsar-mount')).toBe(0)
    for (const reveal of await dialog.locator('.pulsar-reveal').all()) await expectRevealed(reveal)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect.poll(() => triggerCount(page, '.pulsar-mount')).toBe(0)
  }
  expect(errors).toEqual([])
})

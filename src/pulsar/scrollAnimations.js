import { gsap, ScrollTrigger } from '../animations/gsap.js'

/** One context per landing mount, including the standalone HTML export. */
export function mountScrollAnimations(host, { media }) {
  const scroller = host.closest('dialog') || window
  const heroItems = [...host.querySelectorAll('.pulsar-hero-copy > *')]
  const reveals = [...host.querySelectorAll('.pulsar-reveal, .pulsar-view, .pulsar-footer')]
  const counters = [...host.querySelectorAll('[data-count]')]
  const listeners = new AbortController()
  const entries = new Map()
  let context = null
  let disposed = false
  let refreshFrame = 0

  const finishCounters = () => {
    for (const counter of counters) {
      counter.querySelector('.pulsar-counter-value').textContent = counter.dataset.count
    }
  }

  const showContent = () => {
    for (const element of [...heroItems, ...reveals]) element.classList.add('is-visible')
    finishCounters()
  }

  const refresh = () => {
    if (disposed || !context || refreshFrame) return
    refreshFrame = requestAnimationFrame(() => {
      refreshFrame = 0
      if (!disposed && context) ScrollTrigger.refresh()
    })
  }

  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(refresh) : null
  observer?.observe(host)
  if (scroller !== window) observer?.observe(scroller)
  window.addEventListener('resize', refresh, { passive: true, signal: listeners.signal })
  document.fonts?.addEventListener('loadingdone', refresh, { signal: listeners.signal })
  document.fonts?.ready.then(refresh)

  // Keyboard navigation must never focus an element that is waiting for a reveal.
  host.addEventListener('focusin', (event) => {
    for (const [element, animation] of entries) {
      if (element.contains(event.target)) animation.progress(1)
    }
  }, { signal: listeners.signal })

  function setPaused(paused) {
    if (disposed) return
    if (paused || media.matches) {
      context?.revert()
      context = null
      entries.clear()
      showContent()
      return
    }
    if (context) return

    context = gsap.context(() => {
      const enteringHero = heroItems.filter(element => !element.classList.contains('is-visible'))
      if (enteringHero.length) {
        const intro = gsap.fromTo(enteringHero, { opacity: 0, y: 22 }, {
          opacity: 1,
          y: 0,
          duration: 0.75,
          stagger: 0.12,
          ease: 'power2.out',
          clearProps: 'opacity,transform',
          onComplete: () => enteringHero.forEach(element => element.classList.add('is-visible')),
        })
        for (const element of enteringHero) entries.set(element, intro)
      }

      const cards = [...host.querySelectorAll('.pulsar-fact')]
      const grid = host.querySelector('.pulsar-fact-grid')
      const columns = getComputedStyle(grid).gridTemplateColumns.split(' ').length
      for (const element of reveals) {
        if (element.classList.contains('is-visible')) continue
        const cardIndex = cards.indexOf(element)
        const counter = element.querySelector('[data-count]')
        const sequence = gsap.timeline({
          delay: cardIndex < 0 ? 0 : (cardIndex % columns) * 0.09,
          scrollTrigger: {
            trigger: element,
            scroller,
            start: 'top 88%',
            once: true,
          },
          onComplete: () => element.classList.add('is-visible'),
        })
        sequence.fromTo(element, {
          opacity: 0,
          y: element.classList.contains('pulsar-footer') ? 0 : 18,
        }, {
          opacity: 1,
          y: 0,
          duration: 0.7,
          ease: 'power2.out',
          clearProps: 'opacity,transform',
        }, 0)

        if (counter) {
          const value = { current: 0 }
          const output = counter.querySelector('.pulsar-counter-value')
          output.textContent = '0'
          sequence.to(value, {
            current: Number(counter.dataset.count),
            duration: 1.25,
            ease: 'power2.out',
            onUpdate: () => { output.textContent = String(Math.round(value.current)) },
          }, 0.12)
        }
        entries.set(element, sequence)
      }

      // This parent owns only a static CSS rotation. Its children retain their
      // CSS glow/pulse animations; the independently animated stars are untouched.
      gsap.to(host.querySelector('.pulsar-lighthouse'), {
        y: 45,
        ease: 'none',
        scrollTrigger: {
          trigger: host.querySelector('.pulsar-hero'),
          scroller,
          start: 'top top',
          end: 'bottom top',
          scrub: true,
          invalidateOnRefresh: true,
        },
      })
    }, host)
    refresh()
  }

  return {
    setPaused,
    dispose() {
      if (disposed) return
      disposed = true
      cancelAnimationFrame(refreshFrame)
      observer?.disconnect()
      listeners.abort()
      context?.revert()
      context = null
      entries.clear()
      showContent()
    },
  }
}

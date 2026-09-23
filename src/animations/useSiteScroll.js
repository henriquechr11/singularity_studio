import { useContext, useEffect } from 'react'
import { AnimationContext } from './motionContext'
import { gsap, ScrollTrigger } from './gsap'

/** GSAP owns only these decorations, word spans and image masks; Motion owns their parents. */
function useSiteScroll(siteRef, { ready, paused, all, lang }) {
  useEffect(() => {
    if (!ready || paused) return
    const site = siteRef.current
    let live = true
    let frame
    const refresh = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => { if (live) ScrollTrigger.refresh() })
    }
    const ctx = gsap.context(() => {
      const media = gsap.matchMedia()
      media.add({ desktop: '(min-width: 761px)', motion: '(prefers-reduced-motion: no-preference)' }, ({ conditions }) => {
        if (!conditions.motion) return
        if (conditions.desktop) {
          gsap.to('.hero-visual .black-hole', {
            y: -44, ease: 'none',
            scrollTrigger: { trigger: site.querySelector('.hero'), start: 'top top', end: 'bottom top', scrub: true, invalidateOnRefresh: true },
          })
          gsap.fromTo('.about-mark', { y: 18 }, {
            y: -18, ease: 'none',
            scrollTrigger: { trigger: site.querySelector('.about'), start: 'top bottom', end: 'bottom top', scrub: true },
          })
        }
        const heading = site.querySelector('.about-headline h2')
        gsap.fromTo(heading.querySelectorAll('[data-scroll-word]'), { opacity: 0.25 }, {
          opacity: 1, stagger: 0.08, ease: 'none',
          scrollTrigger: { trigger: heading, start: 'top 85%', end: 'bottom 60%', scrub: true },
        })
        site.querySelectorAll('.project-image-button').forEach(image => {
          gsap.fromTo(image, { clipPath: 'inset(0% 0% 10% 0%)' }, {
            clipPath: 'inset(0% 0% 0% 0%)', duration: 0.75, ease: 'power2.out',
            scrollTrigger: { trigger: image, start: 'top 90%', once: true },
          })
        })
      })
      return () => media.revert()
    }, site)
    // Details, translated copy, fonts and project additions can change trigger positions.
    const observer = new ResizeObserver(refresh)
    observer.observe(site)
    site.addEventListener('load', refresh, true)
    site.addEventListener('toggle', refresh, true)
    document.fonts?.ready.then(() => { if (live) refresh() })
    refresh()
    return () => {
      live = false
      cancelAnimationFrame(frame)
      observer.disconnect()
      site.removeEventListener('load', refresh, true)
      site.removeEventListener('toggle', refresh, true)
      ctx.revert()
    }
  }, [siteRef, ready, paused, all, lang])
}

export function SiteScrollEffects({ siteRef, all, lang }) {
  const { ready, disabled } = useContext(AnimationContext)
  useSiteScroll(siteRef, { ready, paused: disabled, all, lang })
  return null
}

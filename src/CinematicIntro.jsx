import { useEffect, useRef, useState } from 'react'
import { clamp01, FLIGHT, smoothstep } from './cinematic/cameraPath'
import './CinematicIntro.css'

function initialMode() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return 'reduced'
  if (navigator.connection?.saveData || (navigator.deviceMemory && navigator.deviceMemory <= 2) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2)) return 'static'
  return 'loading'
}

export default function CinematicIntro({ lang, siteRef, onReveal, onHoldChange, onLoadingProgress, onSceneReady }) {
  const [mode, setMode] = useState(initialMode)
  const [complete, setComplete] = useState(false)
  const trackRef = useRef(null), stageRef = useRef(null), canvasRef = useRef(null)
  const engineRef = useRef(null)
  const state = useRef({ mode, progress: 0, controlled: false, revealed: false })

  useEffect(() => { state.current.mode = mode }, [mode])
  useEffect(() => {
    // Accessibility and data-saving fallbacks intentionally skip WebGL/model
    // loading. There is no scene initialization left to wait for in these modes.
    if (mode === 'static' || mode === 'reduced') onSceneReady?.()
  }, [mode, onSceneReady])

  useEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)')
    const change = () => { if (reduced.matches) setMode('reduced') }
    reduced.addEventListener('change', change)
    return () => reduced.removeEventListener('change', change)
  }, [])

  const animated = mode === 'loading' || mode === 'ready'
  useEffect(() => {
    if (!animated) return
    let active = true
    const abort = new AbortController()
    const timeout = setTimeout(() => { abort.abort(); if (active) setMode('static') }, 22000)
    const canvas = canvasRef.current
    const quality = matchMedia('(max-width: 760px), (pointer: coarse)').matches || (navigator.deviceMemory && navigator.deviceMemory <= 4) ? 'low' : 'high'
    stageRef.current.dataset.quality = quality
    const failed = event => {
      event?.preventDefault()
      if (active) setMode('static')
    }
    canvas.addEventListener('webglcontextlost', failed)
    import('./cinematic/createScene').then(({ createScene }) => {
      if (!active) return null
      return createScene({ canvas, quality, signal: abort.signal, onProgress: value => {
        if (!active) return
        stageRef.current.dataset.loaded = String(value)
        onLoadingProgress?.(value)
      } })
    }).then(engine => {
      clearTimeout(timeout)
      if (!engine) return
      if (!active) { engine.dispose(); return }
      engineRef.current = engine
      setMode('ready')
      onSceneReady?.()
    }).catch(() => { clearTimeout(timeout); failed() })
    return () => {
      active = false
      clearTimeout(timeout)
      abort.abort()
      engineRef.current?.dispose()
      engineRef.current = null
      canvas.removeEventListener('webglcontextlost', failed)
    }
  }, [animated, onLoadingProgress, onSceneReady])

  useEffect(() => {
    const track = trackRef.current, stage = stageRef.current, site = siteRef.current
    let frame, holdTimer, entryFrame, holding = false, hasHeld = false
    let last = performance.now(), span = track.offsetHeight, target = 0, dirty = true
    let samples = 0, slowTime = 0, downgraded = false
    const notifyReveal = reveal => {
      if (state.current.revealed === reveal) return
      state.current.revealed = reveal
      setComplete(reveal)
      onReveal(reveal)
      if (reveal && stage.contains(document.activeElement)) site.querySelector('#hero-title')?.focus({ preventScroll: true })
    }
    const finishHold = () => {
      if (!holding) return
      holding = false
      clearTimeout(holdTimer)
      stage.dataset.phase = 'complete'
      site.dataset.introPhase = 'ready'
      onHoldChange(false)
    }
    const beginHold = () => {
      hasHeld = true
      holding = true
      state.current.progress = 1
      target = 1
      stage.dataset.phase = 'hero-entry'
      site.dataset.introPhase = 'entering'
      onHoldChange(true)
      window.dispatchEvent(new CustomEvent('singularity:skip-intro', { detail: span }))
      window.scrollTo({ top: span, behavior: 'instant' })
      notifyReveal(true)
      // The hero is intentionally revealed in layers. Do not release scrolling
      // on an arbitrary delay: wait for every entrance animation to finish.
      // The timeout only prevents a browser interruption from trapping the page.
      holdTimer = window.setTimeout(finishHold, 2600)
      entryFrame = requestAnimationFrame(() => {
        entryFrame = requestAnimationFrame(() => {
          const entries = site.getAnimations({ subtree: true })
            .filter(animation => (animation.animationName || '').startsWith('hero-entry-'))
          if (!entries.length) { finishHold(); return }
          Promise.allSettled(entries.map(animation => animation.finished)).then(() => {
            if (holding) finishHold()
          })
        })
      })
    }
    const readScroll = () => {
      if (holding) {
        target = 1
        if (Math.abs(window.scrollY - span) > 1) window.scrollTo({ top: span, behavior: 'instant' })
        return
      }
      // Once the hero has been reached, it becomes the beginning of the site.
      // Keep the cinematic traversal one-way instead of revealing it again when
      // the user scrolls above the hero or presses Home.
      if (hasHeld && window.scrollY < span) {
        target = 1
        window.dispatchEvent(new CustomEvent('singularity:skip-intro', { detail: span }))
        window.scrollTo({ top: span, behavior: 'instant' })
        dirty = true
        return
      }
      target = clamp01(window.scrollY / Math.max(1, span))
      if (window.scrollY > 1) state.current.controlled = true
      dirty = true
    }
    const resize = () => { span = track.offsetHeight; engineRef.current?.resize(); readScroll() }
    const observer = new ResizeObserver(resize)
    observer.observe(track)
    window.addEventListener('resize', resize)
    window.addEventListener('scroll', readScroll, { passive: true })
    const goToSite = () => {
      finishHold()
      hasHeld = true
      state.current.controlled = true
      state.current.progress = 1
      window.dispatchEvent(new CustomEvent('singularity:skip-intro', { detail: span }))
      window.scrollTo({ top: span, behavior: 'instant' })
      readScroll()
      notifyReveal(true)
      requestAnimationFrame(() => site.querySelector('#hero-title')?.focus({ preventScroll: true }))
    }
    // The shot has no visible controls. Native PageDown/Space scroll it;
    // Escape remains a keyboard shortcut to the site.
    const onKeyDown = event => {
      if (holding && [' ', 'ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault()
        return
      }
      if (event.key === 'Escape' && !state.current.revealed) {
        event.preventDefault()
        goToSite()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    const preventScroll = event => { if (holding) event.preventDefault() }
    window.addEventListener('wheel', preventScroll, { passive: false })
    window.addEventListener('touchmove', preventScroll, { passive: false })
    const hashNavigation = () => {
      if (!location.hash || location.hash === '#top') return
      const destination = document.getElementById(location.hash.slice(1))
      if (destination && site.contains(destination)) {
        finishHold()
        hasHeld = true
        state.current.progress = 1
        site.style.setProperty('--intro-offset', '0px')
        site.dataset.pinned = 'false'
        notifyReveal(true)
        requestAnimationFrame(() => {
          const top = destination.getBoundingClientRect().top + window.scrollY - 30
          window.dispatchEvent(new CustomEvent('singularity:skip-intro', { detail: top }))
          window.scrollTo({ top, behavior: 'instant' })
          readScroll()
        })
      }
    }
    window.addEventListener('hashchange', hashNavigation)
    const visibility = () => { last = performance.now(); dirty = true }
    document.addEventListener('visibilitychange', visibility)
    const update = now => {
      frame = requestAnimationFrame(update)
      const rawDelta = (now - last) / 1000
      if (document.hidden || rawDelta < (downgraded || stage.dataset.quality === 'low' ? 1 / 30 : 1 / 60) - 0.001) return
      last = now
      const delta = Math.min(rawDelta, 0.06)
      const current = state.current
      const isStatic = current.mode === 'static' || current.mode === 'reduced'
      const isReduced = current.mode === 'reduced'
      if (isReduced && holding) finishHold()
      if (!dirty && current.progress === target && (current.progress === 1 || isStatic) && (!isReduced || current.revealed)) return
      if (isReduced) {
        target = 1; current.progress = 1
      } else {
        const difference = target - current.progress
        const step = Math.min(Math.abs(difference) * (1 - Math.exp(-3.2 * delta)), 0.18 * delta)
        current.progress = Math.abs(difference) < 0.0005 ? target : current.progress + Math.sign(difference) * step
      }
      const p = current.progress
      const reveal = isStatic ? smoothstep(0.65, 1, p) : smoothstep(FLIGHT.revealStart, FLIGHT.revealEnd, p)
      site.style.setProperty('--intro-offset', `${-Math.max(0, span - window.scrollY)}px`)
      site.dataset.pinned = window.scrollY < span && !isReduced ? 'true' : 'false'
      site.style.setProperty('--hero-reveal', reveal.toFixed(4))
      stage.style.setProperty('--scene-opacity', (1 - reveal).toFixed(4))
      stage.style.setProperty('--blackout', smoothstep(FLIGHT.blackoutStart, FLIGHT.blackoutEnd, p).toFixed(4))
      stage.dataset.progress = p.toFixed(4)
      stage.dataset.control = current.controlled ? 'scroll' : 'auto'
      const reachedSite = p >= FLIGHT.revealEnd
      if (reachedSite && !current.revealed) {
        if (!isReduced && !hasHeld) beginHold()
        else notifyReveal(true)
      } else if (!reachedSite && current.revealed && !holding) {
        notifyReveal(false)
      }
      if (engineRef.current && current.mode === 'ready' && p < FLIGHT.revealEnd) {
        const pose = engineRef.current.render({ progress: p, delta, scrollControlled: current.controlled, paused: false })
        if (pose) { stage.dataset.distance = pose.distance.toFixed(3); stage.dataset.fov = pose.fov.toFixed(2); stage.dataset.centerX = pose.centerX.toFixed(3) }
        // Sample only steady rendering, excluding initial decode/compilation.
        if (!downgraded && samples++ > 45 && p < 0.75) {
          slowTime = rawDelta > 0.05 ? slowTime + rawDelta : Math.max(0, slowTime - delta)
          if (slowTime > 2.5) { downgraded = true; engineRef.current.downgrade(); stage.dataset.quality = 'low' }
        }
      }
      dirty = false
    }
    readScroll()
    // Restored scroll positions should show their destination immediately.
    if (target >= 1) { state.current.progress = 1; hasHeld = true }
    hashNavigation()
    frame = requestAnimationFrame(update)
    return () => {
      cancelAnimationFrame(frame)
      cancelAnimationFrame(entryFrame)
      clearTimeout(holdTimer)
      if (holding) onHoldChange(false)
      observer.disconnect()
      window.removeEventListener('resize', resize)
      window.removeEventListener('scroll', readScroll)
      window.removeEventListener('hashchange', hashNavigation)
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('wheel', preventScroll)
      window.removeEventListener('touchmove', preventScroll)
    }
  }, [siteRef, onReveal, onHoldChange])

  return <section className={`cinematic-intro intro-${mode}`} ref={trackRef} aria-label={lang === 'pt' ? 'Introdução: travessia da singularidade' : 'Introduction: crossing the singularity'}>
    <div className={`intro-stage ${complete ? 'intro-complete' : ''}`} ref={stageRef} data-mode={mode} inert={complete} aria-hidden={complete}>
      <div className="intro-fallback" aria-hidden="true"><div className="intro-static-hole"><i/><b/></div></div>
      {animated && <canvas className="intro-canvas" ref={canvasRef} aria-hidden="true"/>}
      <div className="intro-blackout" aria-hidden="true"/>
      <div className="intro-vignette" aria-hidden="true"/>
    </div>
  </section>
}

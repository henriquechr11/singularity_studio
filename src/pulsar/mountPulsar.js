import { heroMarkup, closingMarkup, mountLanding, PULSAR_MODEL_URL, PULSAR_HOTSPOTS } from './landing.js'

const DEFAULT_SETTINGS = Object.freeze({
  rotationSpeed: 0.7,
  inclination: 13,
  bloom: 1.2,
  beamWidth: 1,
  particleCount: 1400,
})

const copy = {
  pt: {
    type: 'Estrela de nêutrons',
    description: 'Um farol cósmico. Dois feixes de radiação percorrem o espaço a cada rotação.',
    controls: 'Ajustar o pulsar',
    rotationSpeed: 'Velocidade de rotação',
    inclination: 'Inclinação do feixe',
    bloom: 'Intensidade do bloom',
    beamWidth: 'Largura dos feixes',
    particleCount: 'Quantidade de partículas',
    pause: 'Pausar',
    play: 'Retomar',
    reset: 'Resetar câmera',
    live: 'Em rotação',
    paused: 'Pausado',
    desktop: 'Arraste para orbitar. Role para aproximar.',
    touch: 'Arraste para orbitar. Use dois dedos para zoom e pan.',
    keyboard: 'Com a cena em foco, use as setas para mover e + / − para zoom. Shift + arraste move a câmera.',
    about: 'Por que ele pulsa?',
    explanation: 'Quando um dos polos magnéticos aponta para a Terra, detectamos um pulso. O núcleo é uma estrela de nêutrons: o remanescente denso de uma estrela massiva. Aqui, a rotação está desacelerada para você observar os feixes.',
    loading: 'Preparando a cena…',
    error: 'A cena 3D não pôde ser iniciada. Verifique se a aceleração gráfica está habilitada no navegador.',
    retry: 'Tentar novamente',
    scene: 'Pulsar 3D interativo com dois feixes azuis opostos',
  },
  en: {
    type: 'Neutron star',
    description: 'A cosmic lighthouse. Two beams of radiation sweep through space with every rotation.',
    controls: 'Adjust the pulsar',
    rotationSpeed: 'Rotation speed',
    inclination: 'Beam inclination',
    bloom: 'Bloom intensity',
    beamWidth: 'Beam width',
    particleCount: 'Particle count',
    pause: 'Pause',
    play: 'Resume',
    reset: 'Reset camera',
    live: 'Rotating',
    paused: 'Paused',
    desktop: 'Drag to orbit. Scroll to zoom.',
    touch: 'Drag to orbit. Use two fingers to zoom and pan.',
    keyboard: 'Focus the scene and use arrow keys to pan, + / − to zoom. Shift + drag also pans.',
    about: 'Why does it pulse?',
    explanation: 'When a magnetic pole points toward Earth, we detect a pulse. The core is a neutron star: the dense remnant of a massive star. The rotation is slowed here so you can observe the beams.',
    loading: 'Preparing the scene…',
    error: 'The 3D scene could not start. Check that graphics acceleration is enabled in your browser.',
    retry: 'Try again',
    scene: 'Interactive 3D pulsar with two opposing blue beams',
  },
}

const ranges = [
  { key: 'rotationSpeed', min: 0, max: 2, step: 0.05, unit: '×' },
  { key: 'inclination', min: 0, max: 35, step: 1, unit: '°' },
  { key: 'bloom', min: 0, max: 2.5, step: 0.05, unit: '' },
  { key: 'beamWidth', min: 0.4, max: 2, step: 0.05, unit: '×' },
  { key: 'particleCount', min: 0, max: 4000, step: 100, unit: '' },
]

const icon = (name) => {
  const paths = {
    pause: '<path d="M8 5v14M16 5v14"/>',
    play: '<path d="m8 5 11 7-11 7Z"/>',
    reset: '<path d="M4 10a8 8 0 1 1 1.4 7M4 4v6h6"/>',
  }
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`
}

/** No saved preferences: every visit starts with the same camera and settings. */
export function mountPulsar(host) {
  // Esta landing page é sempre apresentada em português do Brasil.
  const lang = 'pt'
  host.lang = 'pt-BR'
  const t = copy[lang] || copy.pt
  const settings = { ...DEFAULT_SETTINGS }
  const media = matchMedia('(prefers-reduced-motion: reduce)')
  const coarse = matchMedia('(pointer: coarse)')
  const listeners = new AbortController()
  let paused = media.matches
  let controller = null
  let disposed = false
  let attempt = 0

  const format = (value, range) => new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'pt-BR', {
    maximumFractionDigits: 2,
    minimumFractionDigits: ['bloom', 'beamWidth', 'rotationSpeed'].includes(range.key) ? 1 : 0,
  }).format(value) + range.unit

  // All markup below is static application copy; values never contain user input.
  host.innerHTML = `
    ${heroMarkup}
    <div class="pulsar-view" aria-label="Pulsar">
      <div class="pulsar-viewport">
        <div class="pulsar-canvas-host"></div>
        <div class="pulsar-hotspots" aria-label="Partes do pulsar">
          ${PULSAR_HOTSPOTS.map((hotspot, index) => `<div class="pulsar-hotspot" data-hotspot="${index}" hidden><button type="button" aria-expanded="false" aria-controls="pulsar-note-${index}"><i aria-hidden="true"></i>${hotspot.label}</button><p id="pulsar-note-${index}" hidden>${hotspot.description}</p></div>`).join('')}
        </div>
        <div class="pulsar-status" aria-live="polite"><i aria-hidden="true"></i><span></span></div>
        <div class="pulsar-message" role="status"><span>${t.loading}</span><button type="button" hidden>${t.retry}</button></div>
        <p class="pulsar-gesture">Arraste para girar · Role para dar zoom${coarse.matches ? '<br>No celular, use dois dedos para ampliar.' : ''}</p>
        <span class="pulsar-accessible-hint">${t.keyboard}</span>
      </div>
      <aside class="pulsar-panel" aria-label="${t.controls}">
        <header class="pulsar-heading"><h2>Pulsar<span aria-hidden="true">.</span></h2><p class="pulsar-type">${t.type}</p><p class="pulsar-description">${t.description}</p></header>
        <fieldset class="pulsar-ranges" disabled><legend>${t.controls}</legend>
          ${ranges.map(range => `<label class="pulsar-range"><span>${t[range.key]}<output>${format(settings[range.key], range)}</output></span><input type="range" name="${range.key}" aria-label="${t[range.key]}" min="${range.min}" max="${range.max}" step="${range.step}" value="${settings[range.key]}"></label>`).join('')}
        </fieldset>
        <div class="pulsar-actions"><button type="button" class="pulsar-pause" disabled></button><button type="button" class="pulsar-reset" disabled>${icon('reset')}<span>${t.reset}</span></button></div>
        <details class="pulsar-about"><summary>${t.about}</summary><p>${t.explanation}</p></details>
      </aside>
    </div>${closingMarkup}`

  const viewport = host.querySelector('.pulsar-canvas-host')
  const status = host.querySelector('.pulsar-status')
  const pauseButton = host.querySelector('.pulsar-pause')
  const resetButton = host.querySelector('.pulsar-reset')
  const message = host.querySelector('.pulsar-message')
  const fieldset = host.querySelector('fieldset')
  const retry = message.querySelector('button')
  const updatePaused = () => {
    pauseButton.innerHTML = `${icon(paused ? 'play' : 'pause')}<span>${paused ? t.play : t.pause}</span>`
    pauseButton.setAttribute('aria-pressed', String(paused))
    status.dataset.paused = String(paused)
    status.querySelector('span').textContent = paused ? t.paused : t.live
    controller?.setPaused(paused)
  }
  updatePaused()
  const disposeLanding = mountLanding(host, { media, signal: listeners.signal, onMotionChange(value) { paused = value; updatePaused() } })
  const hotspots = [...host.querySelectorAll('.pulsar-hotspot')]
  for (const hotspot of hotspots) {
    const button = hotspot.querySelector('button')
    button.addEventListener('click', () => {
      const expanded = button.getAttribute('aria-expanded') !== 'true'
      for (const other of hotspots) {
        other.querySelector('button').setAttribute('aria-expanded', 'false')
        other.querySelector('p').hidden = true
      }
      button.setAttribute('aria-expanded', String(expanded))
      hotspot.querySelector('p').hidden = !expanded
    }, { signal: listeners.signal })
  }

  function showError() {
    if (disposed) return
    message.hidden = false
    message.querySelector('span').textContent = t.error
    retry.hidden = false
    fieldset.disabled = true
    pauseButton.disabled = true
    resetButton.disabled = true
    status.hidden = true
    hotspots.forEach(hotspot => { hotspot.hidden = true })
  }

  async function initialize() {
    const currentAttempt = ++attempt
    controller?.dispose()
    controller = null
    message.hidden = false
    message.querySelector('span').textContent = t.loading
    retry.hidden = true
    try {
      // Lazy load: the rest of the site does not pay for a second WebGL scene.
      const { createPulsarScene } = await import('./createPulsarScene.js')
      if (disposed || currentAttempt !== attempt) return
      controller = createPulsarScene(viewport, {
        settings,
        paused,
        transparent: true,
        autoRotate: true,
        modelUrl: PULSAR_MODEL_URL,
        hotspots: PULSAR_HOTSPOTS,
        onHotspots(points) {
          points.forEach((point, index) => {
            const element = hotspots[index]
            element.hidden = !point.visible
            element.style.left = `${Math.max(8, Math.min(point.x, viewport.clientWidth - element.offsetWidth - 8))}px`
            element.style.top = `${Math.max(48, Math.min(point.y, viewport.clientHeight - 100))}px`
          })
        },
        onError: showError,
        onReady() {
          if (disposed) return
          message.hidden = true
          status.hidden = false
          fieldset.disabled = false
          pauseButton.disabled = false
          resetButton.disabled = false
        },
      })
      const canvas = viewport.querySelector('canvas')
      if (canvas) {
        canvas.setAttribute('aria-label', `${t.scene}. ${t.keyboard}`)
      }
    } catch {
      showError()
    }
  }

  for (const range of ranges) {
    const input = host.querySelector(`[name="${range.key}"]`)
    const updateValue = () => {
      const value = Number(input.value)
      settings[range.key] = value
      input.closest('label').querySelector('output').textContent = format(value, range)
      input.style.setProperty('--range-progress', `${(value - range.min) / (range.max - range.min) * 100}%`)
      input.setAttribute('aria-valuetext', format(value, range))
      controller?.setSettings({ [range.key]: value })
    }
    updateValue()
    input.addEventListener('input', updateValue, { signal: listeners.signal })
  }
  pauseButton.addEventListener('click', () => { paused = !paused; updatePaused() }, { signal: listeners.signal })
  resetButton.addEventListener('click', () => controller?.resetCamera(), { signal: listeners.signal })
  retry.addEventListener('click', initialize, { signal: listeners.signal })
  media.addEventListener('change', () => { paused = media.matches; updatePaused() }, { signal: listeners.signal })
  initialize()

  return {
    getState: () => controller?.getState() || { paused, settings, ready: false },
    dispose() {
      disposed = true
      attempt++
      listeners.abort()
      disposeLanding()
      controller?.dispose()
      host.replaceChildren()
    },
  }
}

// TROQUE O CAMINHO AQUI: vazio preserva o pulsar procedural original.
// Exemplo: '/models/meu-pulsar.glb' (GLB ou GLTF, com suas texturas).
export const PULSAR_MODEL_URL = ''

// Posições em unidades 3D, relativas ao centro do modelo. Ajuste após trocar o arquivo.
// space: 'beam' acompanha a inclinação e a rotação dos feixes; 'world' fica no eixo fixo.
export const PULSAR_HOTSPOTS = [
  { label: 'Feixes de radiação', position: [0, 3.6, 0], space: 'beam', description: 'Partem dos polos magnéticos e varrem o espaço enquanto a estrela gira.' },
  { label: 'Eixo de rotação', position: [0, 1.1, 0], space: 'world', description: 'A linha imaginária em torno da qual a estrela gira. Pode estar inclinada em relação aos polos magnéticos.' },
  { label: 'Campo magnético', position: [1.35, -1.1, 0], space: 'beam', description: 'Um campo intenso que orienta partículas e a emissão de radiação perto dos polos.' },
]

export const heroMarkup = `
  <!-- 1. HERO: campo de estrelas e farol com pulso de dois segundos. -->
  <header class="pulsar-topbar"><span class="pulsar-wordmark">pulsar<span aria-hidden="true">✳</span></span><span>Um encontro com o cosmos</span></header>
  <section class="pulsar-hero" aria-labelledby="pulsar-title">
    <div class="pulsar-stars" aria-hidden="true"></div>
    <div class="pulsar-lighthouse" aria-hidden="true"><i></i><b></b><span></span></div>
    <div class="pulsar-hero-copy">
      <h1 id="pulsar-title">Pulsar: o farol do cosmos</h1>
      <p>Uma estrela de nêutrons que gira centenas de vezes por segundo, emitindo feixes de radiação pelo espaço.</p>
      <button type="button" class="pulsar-explore pulsar-glow">Explorar <span aria-hidden="true">↓</span></button>
    </div>
    <div class="pulsar-hero-foot"><span>Uma estrela. Dois feixes. Um sinal.</span><button type="button" class="pulsar-motion" aria-pressed="false">Pausar animações</button></div>
  </section>
  <!-- 2. MODELO 3D: a cena original, com controles e anotações projetadas. -->
  <section class="pulsar-model pulsar-divider" id="pulsar-model" aria-labelledby="pulsar-model-title">
    <div class="pulsar-section-heading pulsar-reveal"><h2 id="pulsar-model-title" tabindex="-1">Um farol em movimento.</h2><p>Explore a estrela por todos os ângulos.<br>A rotação está desacelerada para observação.</p></div>`

export const closingMarkup = `
  </section>
  <!-- 3. DADOS E FECHAMENTO -->
  <section class="pulsar-facts pulsar-divider" aria-labelledby="pulsar-facts-title">
    <div class="pulsar-section-heading pulsar-reveal"><h2 id="pulsar-facts-title">Pequeno em tamanho.<br>Imenso em extremos.</h2><p>Os números de uma estrela de nêutrons.</p></div>
    <div class="pulsar-fact-grid">
      <article class="pulsar-fact pulsar-glow pulsar-reveal"><strong>~20 <small>km</small></strong><h3>de diâmetro</h3><p>~1,4 massa solar concentrada em uma esfera do tamanho de uma cidade.</p></article>
      <article class="pulsar-fact pulsar-glow pulsar-reveal"><strong>ms <span>→</span> s</strong><h3>por rotação</h3><p>Milissegundos a segundos. Cada volta pode trazer um novo pulso.</p></article>
      <article class="pulsar-fact pulsar-glow pulsar-reveal"><strong>1967</strong><h3>o primeiro sinal</h3><p>Descoberto em 1967 por Jocelyn Bell Burnell.</p></article>
      <article class="pulsar-fact pulsar-glow pulsar-reveal"><strong>~30 <small>rotações/s</small></strong><h3>Pulsar do Caranguejo</h3><p>Um remanescente de supernova que continua marcando o tempo.</p></article>
    </div>
    <p class="pulsar-closing pulsar-reveal">No silêncio do espaço,<br>o universo tem seu próprio ritmo.</p>
    <footer class="pulsar-footer"><span class="pulsar-wordmark">pulsar<span aria-hidden="true">✳</span></span><span>Uma janela para o universo.</span><button type="button" class="pulsar-top">Voltar ao topo ↑</button></footer>
  </section>`

/** Observers and listeners belong to this mount and are released on close. */
export function mountLanding(host, { media, signal, onMotionChange }) {
  if (!document.querySelector('#pulsar-fonts')) {
    const fonts = document.createElement('link')
    fonts.id = 'pulsar-fonts'
    fonts.rel = 'stylesheet'
    fonts.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@400;500;600&display=swap'
    document.head.append(fonts)
  }
  const root = host.closest('dialog')
  if (root) root.scrollTop = 0
  const scrollTo = (element) => {
    element.scrollIntoView({ behavior: media.matches ? 'instant' : 'smooth', block: 'start' })
    element.focus({ preventScroll: true })
  }
  host.querySelector('.pulsar-explore').addEventListener('click', () => scrollTo(host.querySelector('#pulsar-model-title')), { signal })
  host.querySelector('.pulsar-top').addEventListener('click', () => {
    (root || window).scrollTo({ top: 0, behavior: media.matches ? 'instant' : 'smooth' })
    host.querySelector('.pulsar-explore').focus({ preventScroll: true })
  }, { signal })
  const motionButton = host.querySelector('.pulsar-motion')
  function setMotion(paused) {
    host.dataset.motionPaused = String(paused)
    motionButton.textContent = paused ? 'Retomar animações' : 'Pausar animações'
    motionButton.setAttribute('aria-pressed', String(paused))
  }
  setMotion(media.matches)
  motionButton.addEventListener('click', () => {
    const paused = host.dataset.motionPaused !== 'true'
    setMotion(paused)
    onMotionChange(paused)
  }, { signal })
  media.addEventListener('change', () => setMotion(media.matches), { signal })
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {
      entry.target.classList.add('is-visible')
      observer.unobserve(entry.target)
    }
  }, { root, threshold: 0.08 })
  host.querySelectorAll('.pulsar-reveal').forEach(element => observer.observe(element))
  return () => observer.disconnect()
}

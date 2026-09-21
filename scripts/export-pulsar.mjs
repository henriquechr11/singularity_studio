import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
import { build } from 'vite'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// Keep the standalone page and the React integration on exactly the same code.
// Only Three.js and its official addons are loaded from the pinned CDN version.
const result = await build({
  configFile: false,
  root,
  logLevel: 'warn',
  build: {
    write: false,
    minify: false,
    target: 'es2022',
    lib: { entry: resolve(root, 'src/pulsar/standalone.js'), formats: ['es'], fileName: 'pulsar' },
    rolldownOptions: {
      external: (id) => id === 'three' || id.startsWith('three/'),
      output: { codeSplitting: false },
    },
  },
})
const chunks = (Array.isArray(result) ? result.flatMap(item => item.output) : result.output)
const code = chunks.filter(item => item.type === 'chunk').map(item => item.code).join('\n')
const css = await readFile(resolve(root, 'src/pulsar/pulsar.css'), 'utf8')
const { version } = JSON.parse(await readFile(resolve(root, 'node_modules/three/package.json'), 'utf8'))
const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#020814">
  <meta name="description" content="Pulsar 3D interativo: estrela de nêutrons, jatos de plasma e controles de rotação, inclinação e luz.">
  <title>Pulsar — uma estrela de nêutrons em movimento</title>
  <style>
    html { color-scheme: dark; background: #02050b; }
    body { margin: 0; min-height: 100vh; min-height: 100svh; }
    main { width: 100%; }
    .standalone-loading { padding: 40px; font: 14px/1.7 system-ui, sans-serif; color: #bfe6ff; }
    @media (max-width: 600px) { body { padding: 0; display: block; } main { border: 0; } }
    ${css}
  </style>
  <script type="importmap">
    {"imports":{"three":"https://cdn.jsdelivr.net/npm/three@${version}/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@${version}/examples/jsm/"}}
  </script>
</head>
<body>
  <main id="pulsar" class="pulsar-mount"><p class="standalone-loading">Preparando o pulsar 3D…</p></main>
  <noscript>Ative o JavaScript para explorar a cena 3D.</noscript>
  <!--
    Ajustes: PULSAR_COLORS controla as cores; PULSAR_TURBULENCE controla
    a amplitude das ondulações. beamWidth controla a abertura dos feixes.
    Arquivo gerado por npm run export:pulsar. Fontes: Space Grotesk e Inter.
    PULSAR_MODEL_URL em src/pulsar/landing.js permite substituir o modelo.
  -->
  <script>
    window.addEventListener('error', function () {
      var loading = document.querySelector('.standalone-loading');
      if (loading) loading.textContent = 'Não foi possível carregar a cena. Verifique sua conexão para carregar a biblioteca Three.js e recarregue a página.';
    }, true);
  </script>
  <script type="module">
${code.replaceAll('</script', '<\\/script')}
  </script>
</body>
</html>
`
await writeFile(resolve(root, 'public/pulsar.html'), html, 'utf8')
console.log(`Pulsar standalone: public/pulsar.html (${(Buffer.byteLength(html) / 1024).toFixed(1)} KB)`)

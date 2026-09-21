import { mountPulsar } from './mountPulsar.js'

const view = mountPulsar(document.querySelector('#pulsar'), { lang: 'pt' })
window.addEventListener('pagehide', (event) => {
  if (!event.persisted) view.dispose()
})

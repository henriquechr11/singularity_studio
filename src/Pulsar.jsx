import { useEffect, useRef } from 'react'
import { mountPulsar } from './pulsar/mountPulsar'
import './pulsar/pulsar.css'

/** The same view powers the project dialog and the standalone HTML export. */
export default function Pulsar({ lang = 'pt' }) {
  const host = useRef(null)

  useEffect(() => {
    const view = mountPulsar(host.current, { lang })
    return () => view.dispose()
  }, [lang])

  return <div ref={host} className="pulsar-mount" />
}

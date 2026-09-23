import './LoadingScreen.css'

export default function LoadingScreen({ progress = 0, complete = false }) {
  return <div className={`loading-screen ${complete ? 'is-leaving' : ''}`} role="status" aria-live="polite" aria-label="Carregando Singularity Studio">
    <div className="loading-logo" aria-label="Singularity Studio">
      <svg width="52" height="52" viewBox="0 0 48 48" fill="none" aria-hidden="true"><ellipse cx="24" cy="24" rx="20" ry="9" transform="rotate(-38 24 24)" stroke="currentColor" strokeWidth="2.4"/><ellipse cx="24" cy="24" rx="12" ry="20" transform="rotate(-38 24 24)" stroke="currentColor" strokeWidth="2.4"/><circle cx="24" cy="24" r="5" fill="currentColor"/></svg>
      <span>SINGULARITY<small>STUDIO®</small></span>
    </div>
    <div className="loading-line" aria-hidden="true"><i style={{ transform: `scaleX(${Math.max(0.04, Math.min(1, progress / 100))})` }} /></div>
    <span className="sr-only">Carregando modelo 3D: {Math.round(progress)}%</span>
  </div>
}

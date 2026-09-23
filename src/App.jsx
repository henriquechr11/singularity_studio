import { useCallback, useEffect, useRef, useState } from 'react'
import Lenis from 'lenis'
import 'lenis/dist/lenis.css'
import BlackHole from './BlackHole'
import CinematicIntro from './CinematicIntro'
import LoadingScreen from './LoadingScreen'
import Pulsar from './Pulsar'
import { content } from './content'
import './App.css'
import { AnimationProvider, HeroCopy, ReadingProgress, Reveal, RevealGroup, RevealItem, ScrollWords } from './animations/ScrollMotion'
import { SiteScrollEffects } from './animations/useSiteScroll'
import { ScrollTrigger } from './animations/gsap'

const EMAIL = import.meta.env.VITE_CONTACT_EMAIL || 'hello@singularity.studio'
const WHATSAPP = (import.meta.env.VITE_WHATSAPP_NUMBER || '').replace(/\D/g, '')
function Arrow({ diagonal = false, ...props }) { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}><path d={diagonal ? 'M5 19 19 5M5 5h14v14' : 'M4 12h16m-6-6 6 6-6 6'} stroke="currentColor" strokeWidth="1.5" /></svg> }
function Mark({ className = '' }) { return <svg className={className} width="43" height="43" viewBox="0 0 48 48" fill="none" aria-hidden="true"><ellipse cx="24" cy="24" rx="20" ry="9" transform="rotate(-38 24 24)" stroke="currentColor" strokeWidth="2.4"/><ellipse cx="24" cy="24" rx="12" ry="20" transform="rotate(-38 24 24)" stroke="currentColor" strokeWidth="2.4"/><circle cx="24" cy="24" r="5" fill="currentColor" /></svg> }
function Label({ children }) { return <div className="section-label"><span className="label-cross">✳</span>{children}</div> }
function ProjectArt({ type, name }) { return <div className={`project-art art-${type}`} aria-hidden="true"><div className="art-grid"/><span className="art-corner">{type === 'orbital' ? 'THE FUTURE IS IN YOUR ORBIT.' : type === 'pulsar' ? 'FEEL A DIFFERENT FREQUENCY.' : 'A NEW POINT OF VIEW.'}</span><div className="art-shape"><i/><i/><i/><i/><i/></div><strong>{name}</strong><span className="art-bottom">{type === 'orbital' ? 'FINANCE. IN MOTION.' : type === 'pulsar' ? 'SOUND BEYOND THE ORDINARY.' : 'DESIGNED TO GO BEYOND.'}</span><span className="art-symbol">↗</span></div> }


function Clock() {
  const [time, setTime] = useState('')
  useEffect(() => { const tick = () => setTime(new Intl.DateTimeFormat('pt-BR', { hour:'2-digit',minute:'2-digit',second:'2-digit',timeZone:'America/Bahia' }).format(new Date())); tick(); const id=setInterval(tick,1000); return ()=>clearInterval(id) },[])
  return <time suppressHydrationWarning>{time}</time>
}

function ContactForm({ t }) {
  const [interests, setInterests] = useState([])
  const [source, setSource] = useState(null)
  const [brief, setBrief] = useState('')
  const [copied, setCopied] = useState(false)
  const toggle = i => setInterests(prev=>prev.includes(i)?prev.filter(n=>n!==i):[...prev,i])
  const submit = e => {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    const text = `${t.name}: ${data.get('name')}\n${t.email}: ${data.get('email')}\n\n${t.interest}: ${interests.map(i=>t.interests[i]).join(', ') || '—'}\n\n${data.get('message')}\n\n${t.source}: ${source === null ? '—' : t.sources[source]}`
    setBrief(text); setCopied(false)
    window.location.href = `mailto:${EMAIL}?subject=${encodeURIComponent('Singularity Studio — '+data.get('name'))}&body=${encodeURIComponent(text)}`
  }
  const copy = async () => { try { await navigator.clipboard.writeText(brief); setCopied(true) } catch { setCopied(false) } }
  return <form className="contact-form" onSubmit={submit}>
    <fieldset><legend><span>01</span>{t.interest}</legend><div className="chips">{t.interests.map((item,i)=><button key={i} type="button" aria-pressed={interests.includes(i)} onClick={()=>toggle(i)}>{item}<span aria-hidden="true">{interests.includes(i)?'−':'+'}</span></button>)}</div></fieldset>
    <fieldset><legend><span>02</span>{t.details}</legend><div className="input-row"><label><span className="sr-only">{t.name}</span><input name="name" placeholder={t.name+' *'} autoComplete="organization" required maxLength={120}/></label><label><span className="sr-only">{t.email}</span><input type="email" name="email" placeholder={t.email+' *'} autoComplete="email" required maxLength={200}/></label></div><label><span className="sr-only">{t.message}</span><textarea name="message" placeholder={t.message+' *'} required rows={3} maxLength={2000}/></label></fieldset>
    <fieldset><legend><span>03</span>{t.source}</legend><div className="chips source-chips">{t.sources.map((item,i)=><button type="button" key={i} aria-pressed={source===i} onClick={()=>setSource(source===i?null:i)}>{item}</button>)}</div></fieldset>
    <button className="button button-primary submit-button" type="submit">{t.submit}<Arrow diagonal/></button><p className="form-note">{t.formNote}</p>
    {brief && <div className="form-result" role="status"><p>{t.sent}</p><button type="button" className="text-link" onClick={copy}>{copied?t.copied:t.copy}<Arrow/></button><textarea aria-label={t.copy} value={brief} readOnly rows={5}/></div>}
  </form>
}

export default function App() {
  const [lang,setLang] = useState(()=>{ try {return localStorage.getItem('singularity-language') === 'en' ? 'en' : 'pt'} catch {return 'pt'} })
  const t=content[lang]
  const [introRevealed, setIntroRevealed] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [introHolding, setIntroHolding] = useState(false)
  const [loadingProgress, setLoadingProgress] = useState(0)
  const [loadingComplete, setLoadingComplete] = useState(false)
  const siteRef = useRef(null)
  const [all,setAll]=useState(false), [project,setProject]=useState(null), [exploring,setExploring]=useState(false), [zoom,setZoom]=useState(1), [paused,setPaused]=useState(false)
  const projectDialog=useRef(null), exploreDialog=useRef(null), lenisRef=useRef(null)
  const onProgress=useCallback(()=>{},[])
  const onIntroReveal=useCallback(value=>setIntroRevealed(value),[])
  const onIntroHold=useCallback(value=>{if(value)lenisRef.current?.stop();setIntroHolding(value)},[])
  const onSceneReady=useCallback(()=>{setLoadingProgress(100);setLoadingComplete(true)},[])
  useEffect(()=>{document.documentElement.lang=lang==='pt'?'pt-BR':'en';try{localStorage.setItem('singularity-language',lang)}catch{/* Storage can be disabled. */}},[lang])
  useEffect(()=>{
    const media=matchMedia('(prefers-reduced-motion: reduce)')
    const configure=()=>{
      lenisRef.current?.destroy();lenisRef.current=null
      if(!media.matches){
        const lenis=new Lenis({autoRaf:true,anchors:true,duration:1.1})
        lenis.on('scroll',ScrollTrigger.update)
        lenisRef.current=lenis
        if(siteRef.current?.classList.contains('site-entering')||document.querySelector('dialog[open]'))lenis.stop()
      }
    }
    const skip=e=>lenisRef.current?.scrollTo(e.detail,{immediate:true,force:true})
    configure();media.addEventListener('change',configure)
    window.addEventListener('singularity:skip-intro',skip)
    return ()=>{lenisRef.current?.destroy();lenisRef.current=null;media.removeEventListener('change',configure);window.removeEventListener('singularity:skip-intro',skip)}
  },[])
  useEffect(()=>{if(introHolding||exploring||project!==null)lenisRef.current?.stop();else lenisRef.current?.start()},[introHolding,exploring,project])
  useEffect(()=>{const move=e=>{document.documentElement.style.setProperty('--cursor-x',`${e.clientX}px`);document.documentElement.style.setProperty('--cursor-y',`${e.clientY}px`)};window.addEventListener('pointermove',move,{passive:true});return ()=>window.removeEventListener('pointermove',move)},[])
  const openProject=i=>{setProject(i);projectDialog.current.showModal()}
  const closeProject=()=>{projectDialog.current.close();setProject(null)}
  const openExplore=()=>{setExploring(true);exploreDialog.current.showModal()}
  const closeExplore=()=>{exploreDialog.current.close();setExploring(false);setZoom(1)}
  const selected=project===null?null:t.projects[project]
  return <AnimationProvider ready={introRevealed} paused={paused}>
    <ReadingProgress target={siteRef}/>
    <SiteScrollEffects siteRef={siteRef} all={all} lang={lang}/>
    <LoadingScreen progress={loadingProgress} complete={loadingComplete}/>
    <CinematicIntro lang={lang} siteRef={siteRef} onReveal={onIntroReveal} onHoldChange={onIntroHold} onLoadingProgress={setLoadingProgress} onSceneReady={onSceneReady}/>
    <div className={`site-shell ${introRevealed?'site-revealed':''} ${introHolding?'site-entering':''}`} ref={siteRef} inert={!introRevealed} aria-hidden={!introRevealed}>
    <a href="#main" className="skip-link">{lang==='pt'?'Ir para o conteúdo':'Skip to content'}</a>
    <div className="cursor-orbit" aria-hidden="true"/>
    <header className="header" id="top"><a className="brand" href="#top" aria-label="Singularity Studio"><Mark/><span>SINGULARITY<small>STUDIO®</small></span></a><div className="header-actions"><div className="languages" aria-label="Language"><button onClick={()=>setLang('pt')} aria-pressed={lang==='pt'}>PT</button><span>/</span><button onClick={()=>setLang('en')} aria-pressed={lang==='en'}>EN</button></div><a className="header-contact" href="#contato">{t.talk}<Arrow diagonal/></a></div></header>
    <main id="main" className={paused ? 'motion-paused' : ''}>
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-visual"><BlackHole onProgress={onProgress} exploring={false} zoom={1.08} paused={paused} active={introRevealed && !exploring && project === null}/><div className="visual-coordinate">FIG. 001 — SINGULARITY<br/><span>Rₛ = 2GM / c²</span></div><button className="explore-button" onClick={openExplore} aria-label={t.explore}><span>+</span></button><div className="hole-annotation"><span className="annotation-line"/><span>EVENT HORIZON<br/><b>THE POINT OF NO RETURN.</b></span></div></div>
        <HeroCopy title={t.headline} intro={t.intro}/>
        <div className="hero-bottom"><button className="motion-toggle" aria-label={paused?t.play:t.pause} aria-pressed={paused} onClick={()=>setPaused(!paused)}>{paused?'▷':'Ⅱ'}</button></div>
      </section>
      <div className={`marquee ${paused?'is-paused':''}`} aria-label={t.marquee.join(' · ')}><div className="marquee-track" aria-hidden="true">{[0,1,2,3].map(n=><div key={n}>{t.marquee.map(item=><span key={item}>{item}<b>✳</b></span>)}</div>)}</div></div>
      <section className="work section-wrap" id="projetos"><Reveal className="section-heading"><div><Label>{t.workLabel}</Label><h2>{t.workTitle[0]}<br/><span className="muted-title">{t.workTitle[1]}</span><span className="tiny-orbit">↗</span></h2></div><div className="section-heading-right"><p>{t.workText}</p><button className="text-link" onClick={()=>setAll(!all)}>{all?t.fewer:t.allProjects}<Arrow diagonal/></button></div></Reveal><div className="project-grid">{t.projects.slice(0,all?4:2).map((p,i)=><Reveal as="article" className="project" key={p.type} interactive delay={(i % 2) * 0.1}><button className="project-image-button" onClick={()=>openProject(i)} aria-label={`${t.case}: ${p.name}`}><ProjectArt type={p.type} name={p.name}/><span className="project-hover-arrow"><Arrow diagonal/></span></button><div className="project-meta"><span className="mono">{p.category}</span><span className="mono">{p.year}</span></div><div className="project-title"><h3><button onClick={()=>openProject(i)}>{p.name}</button></h3><button className="circle-link" onClick={()=>openProject(i)} aria-label={`${t.case}: ${p.name}`}><Arrow diagonal/></button></div><p>{p.description}</p><span className="concept-label">{t.concept}</span></Reveal>)}</div></section>
      <section className="about section-wrap" id="estudio"><Label>{t.aboutLabel}</Label><Reveal className="about-headline"><h2 aria-label={t.aboutTitle.join(" ")}><span className="muted-title" aria-hidden="true"><ScrollWords>{t.aboutTitle[0]}</ScrollWords></span><br/><span aria-hidden="true"><ScrollWords>{t.aboutTitle[1]}</ScrollWords></span><br/><span aria-hidden="true"><ScrollWords>{t.aboutTitle[2]}</ScrollWords></span></h2><Mark className="about-mark"/></Reveal><Reveal className="about-bottom"><span className="about-coordinate mono">INDEPENDENT MINDS.<br/>SHARED GRAVITY.<br/><span>∞ POSSIBILITIES.</span></span><div><p>{t.aboutText}</p><p>{t.aboutText2}</p><a href="#contato" className="text-link">{t.aboutLink}<Arrow diagonal/></a></div></Reveal><RevealGroup className="pillars">{t.pillars.map((item,i)=><RevealItem key={item}><span>0{i+1}</span>{item}<b>+</b></RevealItem>)}</RevealGroup></section>
      <section className="services section-wrap" id="metodologia"><Reveal className="section-heading"><div><Label>{t.servicesLabel}</Label><h2>{t.servicesTitle[0]}<br/><span className="muted-title">{t.servicesTitle[1]}</span></h2></div><p>{t.servicesText}</p></Reveal><RevealGroup className="service-list">{t.services.map((service,i)=><RevealItem as="details" className="service" key={i} name="services" open={i===0?true:undefined}><summary><span className="service-number">0{i+1}</span><h3>{service[0]}</h3><span className="details-icon">+</span></summary><div className="service-content"><div className={`service-orbit orbit-${i}`} aria-hidden="true"><i/><i/><i/><span>✳</span></div><div><p>{service[1]}</p><span className="mono">{service[2]}</span></div></div></RevealItem>)}</RevealGroup></section>
      <Reveal as="section" className="signal-section section-wrap"><div className="signal-graphic" aria-hidden="true"><div/><div/><div/><span>✳</span></div><div><Label>{t.whyLabel}</Label><h2>{t.whyTitle}</h2><p>{t.whyText}</p></div><span className="signal-coordinates mono">FREQ. 1400 MHz<br/>SIGNAL / NOISE: ∞</span></Reveal>
      <section className="faq section-wrap"><Reveal><Label>{t.faqLabel}</Label><h2>{t.faqTitle}</h2></Reveal><div className="faq-list">{t.faqs.map(([q,a],i)=><details key={i} name="faq"><summary>{q}<span className="details-icon">+</span></summary><p>{a}</p></details>)}</div></section>
      <section className="contact section-wrap" id="contato"><Reveal className="contact-copy"><Label>{t.contactLabel}</Label><h2>{t.contactTitle[0]}<br/>{t.contactTitle[1]}<br/><span>{t.contactTitle[2]}</span><b aria-hidden="true">✳</b></h2><p>{t.contactIntro}</p><a href={`mailto:${EMAIL}`} className="text-link contact-email">{EMAIL}<Arrow diagonal/></a><div className="mini-hole" aria-hidden="true"><i/></div></Reveal><ContactForm t={t}/></section>
    </main>
    <Reveal as="footer" className="footer section-wrap"><div className="footer-top"><a href="#top" className="brand"><Mark/><span>SINGULARITY<small>STUDIO®</small></span></a><span className="mono">{t.footer}</span><a className="back-top" href="#top" aria-label={t.top}>↑</a></div><div className="footer-bottom"><span>© {new Date().getFullYear()} Singularity Studio. {t.rights}</span><div className="footer-clock"><i className="status-dot"/>{t.active}<span>·</span><Clock/><span>GMT−3</span></div><a href={`mailto:${EMAIL}`}>{EMAIL}<Arrow diagonal/></a></div><p className="model-credit">3D: <a href="https://sketchfab.com/3d-models/black-hole-e410da98b1e5445eae2acafaaa53587d" target="_blank" rel="noreferrer">Black Hole — NestaEric</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a> · {lang==='pt'?'Modelo adaptado e otimizado.':'Adapted and optimized model.'}</p></Reveal>
    <a className="floating-contact" href={WHATSAPP?`https://wa.me/${WHATSAPP}`:'#contato'} aria-label={WHATSAPP?'WhatsApp':t.talk} target={WHATSAPP?'_blank':undefined} rel={WHATSAPP?'noopener noreferrer':undefined}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 11.5a8 8 0 0 1-8 8 9 9 0 0 1-3.6-.8L4 20l1.3-4.4a8 8 0 1 1 14.7-4.1Z" stroke="currentColor" strokeWidth="1.5"/><path d="M8 11h8m-8 3h5" stroke="currentColor" strokeWidth="1.5"/></svg></a>
    </div>
    <dialog aria-label={selected ? selected.name : t.case} className={`project-dialog ${selected?.type === 'pulsar' ? 'pulsar-dialog' : ''}`} ref={projectDialog} onCancel={()=>setProject(null)} onClick={e=>{if(e.target===e.currentTarget)closeProject()}} data-lenis-prevent>{selected&&<><button className="dialog-close" onClick={closeProject} aria-label={t.close}>×</button>{selected.type === 'pulsar' ? <Pulsar lang={lang}/> : <><ProjectArt type={selected.type} name={selected.name}/><div className="dialog-body"><span className="mono">{t.concept} / {selected.year}</span><h2>{selected.name}</h2><p>{selected.detail}</p><h3 className="mono">{t.deliveries}</h3><p>{selected.deliverables}</p><small>{t.projectNote}</small><a href="#contato" className="button button-primary" onClick={closeProject}>{t.talk}<Arrow diagonal/></a></div></>}</>}</dialog>
    <dialog aria-label={t.explore} className="explore-dialog" ref={exploreDialog} onCancel={()=>{setExploring(false);setZoom(1)}} data-lenis-prevent>{exploring&&<><BlackHole onProgress={onProgress} exploring zoom={zoom} paused={paused}/><div className="explore-heading"><Mark/><span className="mono">SINGULARITY / EVENT HORIZON</span><button className="dialog-close" onClick={closeExplore} aria-label={t.close}>×</button></div><div className="explore-controls"><div><button onClick={()=>setZoom(v=>Math.max(.6,v-.15))} aria-label="Zoom −" disabled={zoom<=.6}>−</button><span>{zoom.toFixed(2)}×</span><button onClick={()=>setZoom(v=>Math.min(1.8,v+.15))} aria-label="Zoom +" disabled={zoom>=1.8}>+</button><button aria-label={paused?t.play:t.pause} aria-pressed={paused} onClick={()=>setPaused(!paused)}>{paused?'▷':'Ⅱ'}</button></div></div></>}</dialog>
  </AnimationProvider>
}

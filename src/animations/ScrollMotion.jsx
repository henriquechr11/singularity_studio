import { useContext, useEffect, useState } from 'react'
import { motion, useReducedMotion, useScroll, useSpring } from 'framer-motion'
import { AnimationContext } from './motionContext'
import './animations.css'

const elements = { div: motion.div, section: motion.section, article: motion.article, footer: motion.footer, details: motion.details }
const ease = [0.2, 0.72, 0.2, 1]
const viewport = { once: true, amount: 0.3 }
const reveal = {
  hidden: { opacity: 0, y: 22 },
  visible: (delay = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.6, ease, delay } }),
}
const still = { hidden: { opacity: 1, y: 0 }, visible: { opacity: 1, y: 0, transition: { duration: 0 } } }
const cascade = { hidden: {}, visible: { transition: { staggerChildren: 0.1 } } }

export function AnimationProvider({ ready, paused, children }) {
  const preference = useReducedMotion()
  const [reduced, setReduced] = useState(preference)
  useEffect(() => {
    // Also react to OS changes while the page is open.
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  return <AnimationContext.Provider value={{ ready, disabled: Boolean(reduced || paused) }}>{children}</AnimationContext.Provider>
}

/** These components replace DOM tags, so the original grid/flex structure stays intact. */
export function Reveal({ as = 'div', children, delay = 0, interactive = false, ...props }) {
  const { ready, disabled } = useContext(AnimationContext)
  const Element = elements[as]
  return <Element {...props} data-reveal="" custom={delay} variants={disabled ? still : reveal} initial="hidden"
    animate={disabled ? 'visible' : undefined} whileInView={ready ? 'visible' : undefined} viewport={viewport}
    whileHover={interactive && !disabled ? { y: -3, transition: { duration: 0.2 } } : undefined}>
    {children}
  </Element>
}

export function RevealGroup({ children, ...props }) {
  const { ready, disabled } = useContext(AnimationContext)
  return <motion.div {...props} variants={disabled ? { hidden: {}, visible: {} } : cascade} initial="hidden"
    animate={disabled ? 'visible' : undefined} whileInView={ready ? 'visible' : undefined} viewport={viewport}>
    {children}
  </motion.div>
}

export function RevealItem({ as = 'div', children, interactive = false, ...props }) {
  const { disabled } = useContext(AnimationContext)
  const Element = elements[as]
  return <Element {...props} data-reveal="" variants={disabled ? still : reveal}
    whileHover={interactive && !disabled ? { y: -3, transition: { duration: 0.2 } } : undefined}>
    {children}
  </Element>
}

export function HeroCopy({ title, intro }) {
  const { ready, disabled } = useContext(AnimationContext)
  const item = disabled ? still : {
    hidden: { opacity: 0, y: 18 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease } },
  }
  return <motion.div className="hero-copy" initial="hidden" animate={ready || disabled ? 'visible' : 'hidden'}
    variants={{ hidden: {}, visible: { transition: { staggerChildren: disabled ? 0 : 0.065, delayChildren: disabled ? 0 : 0.06 } } }}>
    <h1 id="hero-title" tabIndex={-1}>{title.map((line, i) => <motion.span className={i > 1 ? 'accent' : ''} key={i} variants={item}>
      {line}{i === 3 && <span className="headline-star" aria-hidden="true">✳</span>}
    </motion.span>)}</h1>
    <motion.p variants={item}>{intro}</motion.p>
  </motion.div>
}

export function ReadingProgress({ target }) {
  const { ready, disabled } = useContext(AnimationContext)
  const { scrollYProgress } = useScroll({ target, offset: ['start start', 'end end'] })
  const smooth = useSpring(scrollYProgress, { stiffness: 180, damping: 35, restDelta: 0.001 })
  return <motion.div className="reading-progress" aria-hidden="true"
    style={{ scaleX: disabled ? scrollYProgress : smooth, visibility: ready ? 'visible' : 'hidden' }} />
}

export function ScrollWords({ children }) {
  return children.split(/(\s+)/).map((word, index) => /^\s+$/.test(word)
    ? word
    : <span data-scroll-word="" key={index}>{word}</span>)
}

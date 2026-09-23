import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

// Single registration shared by React and the standalone PULSAR export.
gsap.registerPlugin(ScrollTrigger)

export { gsap, ScrollTrigger }

export const clamp01 = value => Math.max(0, Math.min(1, value))
export const smoothstep = (start, end, value) => {
  const t = clamp01((value - start) / (end - start))
  return t * t * (3 - 2 * t)
}
const mix = (a, b, t) => a + (b - a) * t

export const FLIGHT = {
  wide: 0.48,
  enter: 0.9,
  blackoutStart: 0.84,
  blackoutEnd: 0.91,
  revealStart: 0.92,
  revealEnd: 0.998,
}
export const CLOSE_POSE = { x: -0.9, y: -0.17, z: 4.65 }

// Start alongside the disk, with the horizon cropped beyond the right edge.
// The pullback gradually recenters the lens before the slow fall inward.
export function cameraPose(progress, aspect = 1.6, entry = CLOSE_POSE) {
  const closeFraming = Math.max(1, 0.86 / aspect)
  const wideFraming = Math.max(1, 0.95 / aspect)
  const wide = { x: -1.6 * wideFraming, y: 3 * wideFraming, z: 23 * wideFraming }
  const p = clamp01(progress)
  let x, y, z
  if (p <= FLIGHT.wide) {
    const t = smoothstep(0, FLIGHT.wide, p)
    x = mix(entry.x * closeFraming, wide.x, t)
    y = mix(entry.y * closeFraming, wide.y, t)
    z = mix(entry.z * closeFraming, wide.z, t)
  } else {
    const t = smoothstep(FLIGHT.wide, FLIGHT.enter, p)
    x = mix(wide.x, 0, t)
    y = mix(wide.y, 0, t)
    z = mix(wide.z, 0.055, t)
  }
  return {
    x, y, z,
    fov: 28 + 16 * smoothstep(0, FLIGHT.wide, p) + 32 * smoothstep(0.6, FLIGHT.enter, p),
    offset: 0.57 * (1 - smoothstep(0, 0.44, p)),
    roll: 0.13 * (1 - smoothstep(FLIGHT.wide, FLIGHT.enter, p)),
  }
}

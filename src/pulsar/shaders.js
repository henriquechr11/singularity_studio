// Every texture in the scene is procedural. Keep these small noise functions
// shared so the volume, filaments and particles follow the same plasma flow.
export const noiseGLSL = /* glsl */ `
  float hash31(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }
  float noise3(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash31(i), hash31(i + vec3(1,0,0)), f.x),
          mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x),
          mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) {
    float n = 0.0, amplitude = 0.5;
    for (int i = 0; i < 4; i++) {
      n += amplitude * noise3(p);
      p = p * 2.03 + vec3(13.1, 7.7, 9.2);
      amplitude *= 0.5;
    }
    return n;
  }
`;

export const flowGLSL = /* glsl */ `
  vec3 plasmaCenter(float t, float direction) {
    float envelope = pow(t, 2.7) * uTurbulence;
    float turn = t * 8.5 - uTime * 0.58;
    float n = noise3(vec3(t * 5.0, uTime * 0.14, 2.7)) - 0.5;
    return direction * vec3(
      envelope * (sin(turn) * 0.72 + n * 0.8),
      t * uLength,
      envelope * (cos(turn * 0.81) * 0.56 + n * 0.6)
    );
  }
  vec3 facingRight(vec3 center, float direction) {
    vec3 axis = normalize((modelViewMatrix * vec4(0.0, direction, 0.0, 0.0)).xyz);
    vec3 across = cross(axis, normalize(-center));
    return normalize(across + vec3(0.00001, 0.0, 0.0));
  }
`;

export const beamVertexShader = /* glsl */ `
  uniform float uTime, uLength, uWidth, uTurbulence;
  attribute float aDirection;
  varying vec2 vUv;
  ${noiseGLSL}
  ${flowGLSL}
  void main() {
    vUv = uv;
    float t = uv.y;
    float spread = (0.016 + pow(t, 1.24) * 0.63) * uWidth;
    float eddy = noise3(vec3(t * 11.0, uv.x * 3.0, uTime * 0.23));
    spread *= 0.88 + eddy * 0.27 * smoothstep(0.12, 0.95, t);
    vec3 center = (modelViewMatrix * vec4(plasmaCenter(t, aDirection), 1.0)).xyz;
    center += facingRight(center, aDirection) * position.x * spread;
    gl_Position = projectionMatrix * vec4(center, 1.0);
  }
`;

export const beamFragmentShader = /* glsl */ `
  uniform float uTime, uPulse;
  uniform vec3 uBeamColor, uDeepColor, uCoreColor;
  varying vec2 vUv;
  ${noiseGLSL}
  void main() {
    float t = vUv.y;
    float radial = abs(vUv.x * 2.0 - 1.0);
    float turbulence = fbm(vec3(vUv.x * 5.7, t * 15.0 - uTime * 0.7, uTime * 0.12));
    float outer = exp(-radial * radial * 4.8);
    float inner = exp(-radial * radial * 31.0);
    float spine = exp(-radial * radial * 680.0);
    float edge = 1.0 - smoothstep(0.72, 1.0, radial);
    float tail = 1.0 - smoothstep(0.60, 1.0, t);
    float density = mix(1.0, 0.38 + turbulence * 1.1, smoothstep(0.12, 0.9, t));
    float threads = pow(max(0.0, sin(vUv.x * 42.0 + turbulence * 7.0 - t * 8.0)), 7.0);
    vec3 color = uDeepColor * outer * 0.21;
    color += uBeamColor * (outer * 0.24 + inner * 0.29 + threads * outer * t * 0.10);
    color += uCoreColor * spine * (1.12 - t * 0.82);
    color *= density * tail * edge * uPulse;
    gl_FragColor = vec4(color, 1.0);
  }
`;

export const filamentVertexShader = /* glsl */ `
  uniform float uTime, uLength, uWidth, uTurbulence;
  attribute float aDirection, aFilament;
  varying vec2 vUv;
  varying float vFilament;
  ${noiseGLSL}
  ${flowGLSL}
  void main() {
    vUv = uv;
    vFilament = aFilament;
    float t = mix(0.25, 1.0, uv.y);
    float id = aFilament;
    float wave = t * (8.0 + id * 0.36) - uTime * (0.33 + id * 0.027) + id * 2.4;
    float envelope = pow(t, 1.65) * (0.12 + id * 0.060) * uWidth;
    float eddy = fbm(vec3(t * 12.0, id * 2.8, uTime * 0.18)) - 0.5;
    vec3 flow = plasmaCenter(t, aDirection);
    flow.x += aDirection * (sin(wave) + eddy * uTurbulence * 2.1) * envelope;
    flow.z += aDirection * cos(wave * 0.79) * envelope;
    vec3 center = (modelViewMatrix * vec4(flow, 1.0)).xyz;
    float ribbonWidth = (0.012 + t * 0.045) * (0.72 + id * 0.11) * uWidth;
    center += facingRight(center, aDirection) * position.x * ribbonWidth;
    gl_Position = projectionMatrix * vec4(center, 1.0);
  }
`;

export const filamentFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uBeamColor, uCoreColor;
  varying vec2 vUv;
  varying float vFilament;
  ${noiseGLSL}
  void main() {
    float radial = abs(vUv.x * 2.0 - 1.0);
    float profile = exp(-radial * radial * 5.2) * (1.0 - smoothstep(0.64, 1.0, radial));
    float envelope = smoothstep(0.0, 0.27, vUv.y) * (1.0 - smoothstep(0.54, 1.0, vUv.y));
    float noise = fbm(vec3(vUv.y * 21.0 - uTime * 0.82, vFilament * 3.5, uTime * 0.2));
    vec3 color = mix(uBeamColor, uCoreColor, 0.16) * profile * envelope * noise * 0.62;
    gl_FragColor = vec4(color, 1.0);
  }
`;

export const particleVertexShader = /* glsl */ `
  uniform float uTime, uLength, uWidth, uTurbulence, uPixelRatio;
  attribute vec4 aSeed;
  attribute float aDirection;
  varying float vOpacity;
  ${noiseGLSL}
  ${flowGLSL}
  void main() {
    float age = fract(aSeed.x + uTime * (0.10 + aSeed.w * 0.07));
    // Quadratic distance gives a visibly accelerating outward flow.
    float t = age * age;
    float angle = aSeed.z * 6.283185 + t * 5.0 - uTime * 0.15;
    float radius = sqrt(aSeed.y) * (0.012 + pow(t, 1.30) * 0.53) * uWidth;
    vec3 flow = plasmaCenter(t, aDirection);
    flow += aDirection * vec3(cos(angle) * radius, 0.0, sin(angle) * radius);
    vec4 viewPosition = modelViewMatrix * vec4(flow, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    gl_PointSize = clamp((27.0 / max(1.0, -viewPosition.z)) * uPixelRatio *
      mix(1.7, 0.48, t) * (0.75 + aSeed.w), 0.55, 6.0 * uPixelRatio);
    vOpacity = smoothstep(0.0, 0.018, t) * pow(1.0 - t, 1.55) * (0.10 + aSeed.w * 0.29);
  }
`;

export const particleFragmentShader = /* glsl */ `
  uniform vec3 uCoreColor;
  varying float vOpacity;
  void main() {
    float radius = length(gl_PointCoord - 0.5) * 2.0;
    float light = exp(-radius * radius * 4.5) * (1.0 - smoothstep(0.75, 1.0, radius));
    gl_FragColor = vec4(uCoreColor * light * vOpacity, 1.0);
  }
`;

export const billboardVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const haloFragmentShader = /* glsl */ `
  uniform float uPulse;
  uniform vec3 uCoreColor, uHaloColor;
  varying vec2 vUv;
  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);
    float core = exp(-r * r * 2100.0) * 5.0;
    float glow = exp(-r * 17.0) * 1.1 + exp(-r * 7.4) * 0.064;
    float flare = exp(-abs(p.x) * 12.0 - abs(p.y) * 280.0)
                + exp(-abs(p.y) * 13.0 - abs(p.x) * 320.0);
    vec3 light = uCoreColor * (core + flare * 0.26) + uHaloColor * glow;
    gl_FragColor = vec4(light * uPulse * (1.0 - smoothstep(0.75, 1.0, r)), 1.0);
  }
`;

export const nebulaFragmentShader = /* glsl */ `
  uniform float uTime, uOpacity;
  uniform vec3 uColor;
  uniform float uMist;
  varying vec2 vUv;
  ${noiseGLSL}
  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float envelope = exp(-dot(p * vec2(1.1, 0.86), p * vec2(1.1, 0.86)) * 3.4);
    float cloud = fbm(vec3(p * 3.2, uTime * 0.009));
    float detail = fbm(vec3(p * 7.2 + cloud * 2.4, 4.9 + uTime * 0.012));
    float density = smoothstep(0.20, 0.78, cloud * 0.55 + detail * 0.65);
    float light = envelope * density * uOpacity;
    light *= mix(1.0, exp(-abs(p.x) * 1.8), uMist);
    gl_FragColor = vec4(uColor * light, 1.0);
  }
`;

export const backgroundVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.99999, 1.0);
  }
`;

export const backgroundFragmentShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    float falloff = exp(-length((vUv - vec2(0.50, 0.56)) * vec2(1.0, 0.75)) * 2.5);
    gl_FragColor = vec4(vec3(0.0010, 0.0024, 0.0068) * falloff, 1.0);
  }
`;

export const finishingShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uTransparent: { value: 0 } },
  vertexShader: billboardVertexShader,
  // Applied after OutputPass: film grain stays subtle in display space, and
  // doesn't bloom or introduce colored speckles in the black background.
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uTransparent;
    varying vec2 vUv;
    void main() {
      vec3 color = texture2D(tDiffuse, vUv).rgb;
      vec2 p = (vUv - 0.5) * 2.0;
      float vignette = 1.0 - smoothstep(0.25, 1.60, dot(p, p)) * 0.24;
      float grain = fract(sin(dot(gl_FragCoord.xy + floor(uTime * 24.0), vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
      color = color * vignette + grain * 0.005;
      color = max(color, vec3(0.0));
      // Reconstruct an alpha mask after bloom so its glow blends with the page.
      float alpha = mix(1.0, clamp(max(color.r, max(color.g, color.b)) * 1.5, 0.0, 1.0), uTransparent);
      gl_FragColor = vec4(color / max(alpha, 0.0001), alpha);
    }
  `,
};

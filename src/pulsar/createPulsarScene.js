import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import {
  beamVertexShader, beamFragmentShader, filamentVertexShader, filamentFragmentShader,
  particleVertexShader, particleFragmentShader, billboardVertexShader,
  haloFragmentShader, nebulaFragmentShader, backgroundVertexShader,
  backgroundFragmentShader, finishingShader,
} from './shaders.js';

// Color controls are authored in sRGB; THREE.Color converts them to linear
// light before the bloom and ACES passes. No image or model assets are used.
export const PULSAR_COLORS = Object.freeze({
  core: '#BFE6FF', halo: '#2A7BFF', beam: '#1F6BFF',
  deepBeam: '#0B2A8A', dust: '#3A2A14', mist: '#16417E',
});

// Increase this value for larger S-shaped eddies at the ends of both jets.
export const PULSAR_TURBULENCE = 0.58;

const MAX_PARTICLES = 4000;
const BEAM_LENGTH = 6.3;
const DEFAULT_SETTINGS = Object.freeze({
  rotationSpeed: 0.7, inclination: 13, bloom: 1.2, beamWidth: 1, particleCount: 1400,
});

function additiveMaterial(parameters) {
  return new THREE.ShaderMaterial({
    transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, depthTest: false, side: THREE.DoubleSide,
    toneMapped: false, ...parameters,
  });
}

function seededRandom(seed = 2047) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function sanitizeSettings(previous, partial) {
  const next = { ...previous };
  const bounds = {
    rotationSpeed: [0, 3], inclination: [0, 40], bloom: [0, 3],
    beamWidth: [0.35, 2.5], particleCount: [0, MAX_PARTICLES],
  };
  for (const [key, [min, max]] of Object.entries(bounds)) {
    if (partial[key] !== undefined && Number.isFinite(Number(partial[key]))) {
      next[key] = THREE.MathUtils.clamp(Number(partial[key]), min, max);
    }
  }
  next.particleCount = Math.round(next.particleCount);
  return next;
}

export function createStar(uniforms) {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color(PULSAR_COLORS.core).multiplyScalar(6), toneMapped: false,
  });
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.054, 20, 12), material);
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), additiveMaterial({
    uniforms, vertexShader: billboardVertexShader, fragmentShader: haloFragmentShader,
  }));
  halo.renderOrder = 8;
  group.add(core, halo);
  return { group, core, halo };
}

// Build all the strips into a single geometry. Their vertex shader aligns each
// cross-section to the camera, giving a soft volume even when orbiting.
function createStripGeometry(strips, segments, columns = 8) {
  const positions = [], uvs = [], directions = [], filaments = [], indices = [];
  for (let strip = 0; strip < strips; strip++) {
    const offset = positions.length / 3;
    for (let row = 0; row <= segments; row++) {
      for (let column = 0; column <= columns; column++) {
        positions.push(column / columns * 2 - 1, row / segments, 0);
        uvs.push(column / columns, row / segments);
        directions.push(strip % 2 === 0 ? 1 : -1);
        filaments.push(Math.floor(strip / 2));
      }
    }
    for (let row = 0; row < segments; row++) {
      for (let column = 0; column < columns; column++) {
        const a = offset + row * (columns + 1) + column;
        const b = a + columns + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('aDirection', new THREE.Float32BufferAttribute(directions, 1));
  geometry.setAttribute('aFilament', new THREE.Float32BufferAttribute(filaments, 1));
  geometry.setIndex(indices);
  return geometry;
}

export function createBeam(uniforms, particleCount) {
  const group = new THREE.Group();
  const volume = new THREE.Mesh(createStripGeometry(2, 86, 20), additiveMaterial({
    uniforms, vertexShader: beamVertexShader, fragmentShader: beamFragmentShader,
  }));
  const filaments = new THREE.Mesh(createStripGeometry(14, 72, 4), additiveMaterial({
    uniforms, vertexShader: filamentVertexShader, fragmentShader: filamentFragmentShader,
  }));
  volume.frustumCulled = false;
  filaments.frustumCulled = false;
  volume.renderOrder = 3;
  filaments.renderOrder = 4;

  const random = seededRandom(1337);
  const seeds = new Float32Array(MAX_PARTICLES * 4);
  const directions = new Float32Array(MAX_PARTICLES);
  for (let i = 0; i < MAX_PARTICLES; i++) {
    directions[i] = i % 2 === 0 ? 1 : -1;
    for (let channel = 0; channel < 4; channel++) seeds[i * 4 + channel] = random();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  geometry.setAttribute('aDirection', new THREE.BufferAttribute(directions, 1));
  geometry.setDrawRange(0, particleCount);
  const particles = new THREE.Points(geometry, additiveMaterial({
    uniforms, vertexShader: particleVertexShader, fragmentShader: particleFragmentShader,
  }));
  particles.frustumCulled = false;
  particles.renderOrder = 5;
  group.add(volume, filaments, particles);
  return { group, particles };
}

export function createStarfield(uniforms) {
  const random = seededRandom(9041);
  const positions = [], colors = [], sizes = [], phases = [];
  for (let i = 0; i < 650; i++) {
    const azimuth = random() * Math.PI * 2;
    const cosine = random() * 2 - 1;
    const sine = Math.sqrt(1 - cosine * cosine);
    const distance = 31 + random() * 36;
    positions.push(Math.cos(azimuth) * sine * distance, cosine * distance, Math.sin(azimuth) * sine * distance);
    const blue = random() > 0.58;
    const brightness = 0.26 + Math.pow(random(), 3) * 1.0;
    colors.push(brightness * (blue ? 0.57 : 0.96), brightness * (blue ? 0.74 : 0.98), brightness);
    sizes.push(0.8 + Math.pow(random(), 4) * 1.65);
    phases.push(random() * Math.PI * 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
  geometry.setAttribute('aPhase', new THREE.Float32BufferAttribute(phases, 1));
  const stars = new THREE.Points(geometry, additiveMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      uniform float uTime, uPixelRatio;
      attribute vec3 color;
      attribute float aSize, aPhase;
      varying vec3 vColor;
      void main() {
        vColor = color * (0.94 + sin(uTime * 0.31 + aPhase) * 0.06);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uPixelRatio;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        gl_FragColor = vec4(vColor * exp(-r * r * 3.8), 1.0);
      }
    `,
  }));
  stars.renderOrder = 0;
  return stars;
}

export function createNebula(uniforms) {
  function cloud(color, opacity, mist, size, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), additiveMaterial({
      uniforms: {
        uTime: uniforms.uTime, uColor: { value: new THREE.Color(color) },
        uOpacity: { value: opacity }, uMist: { value: mist },
      },
      vertexShader: billboardVertexShader, fragmentShader: nebulaFragmentShader,
    }));
    mesh.position.set(x, y, z);
    mesh.renderOrder = -1;
    return mesh;
  }
  const dust = cloud(PULSAR_COLORS.dust, 0.44, 0, 27, -7.5, 1, -9);
  const mist = cloud(PULSAR_COLORS.mist, 0.23, 1, 15, 0, 0, -4);
  return [dust, mist];
}

export function setupPostProcessing(renderer, scene, camera, settings) {
  const composer = new EffectComposer(renderer);
  const render = new RenderPass(scene, camera);
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), settings.bloom, 0.6, 0.1);
  const output = new OutputPass();
  const finishing = new ShaderPass(finishingShader);
  composer.addPass(render);
  composer.addPass(bloom);
  composer.addPass(output);
  composer.addPass(finishing);
  return { composer, bloom, finishing, passes: [render, bloom, output, finishing] };
}

export function createPulsarScene(container, options = {}) {
  let settings = sanitizeSettings(DEFAULT_SETTINGS, options.settings || {});
  let paused = Boolean(options.paused);
  let disposed = false, failed = false, ready = false;
  let inView = true, frame = 0, lastNow = 0, time = 0, spin = 0;
  let datasetTime = -1, adaptationFrames = 0, frameCost = 0;
  let width = 1, height = 1;
  let pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 140);
  const initialPosition = new THREE.Vector3(0.25, 0.08, 19.2);
  camera.position.copy(initialPosition);

  const renderer = new THREE.WebGLRenderer({
    antialias: false, alpha: true, premultipliedAlpha: false, powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearColor(0x000000, options.transparent ? 0 : 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.info.autoReset = false;
  const canvas = renderer.domElement;
  canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;';
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', 'Modelo 3D interativo de um pulsar. Arraste para orbitar, use a roda ou mais e menos para aproximar e as setas para mover a câmera.');
  canvas.dataset.ready = 'false';
  canvas.dataset.time = '0.000';
  container.appendChild(canvas);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.autoRotate = Boolean(options.autoRotate) && !paused;
  controls.autoRotateSpeed = 0.35;
  controls.dampingFactor = 0.065;
  controls.rotateSpeed = 0.45;
  controls.zoomSpeed = 0.65;
  controls.panSpeed = 0.6;
  controls.minDistance = 8;
  controls.maxDistance = 38;
  controls.maxTargetRadius = 10;
  controls.listenToKeyEvents(canvas);
  controls.target.set(0, 0, 0);
  controls.update();
  controls.saveState();

  const uniforms = {
    uTime: { value: 0 }, uPulse: { value: 1 }, uLength: { value: BEAM_LENGTH },
    uWidth: { value: settings.beamWidth }, uTurbulence: { value: PULSAR_TURBULENCE },
    uPixelRatio: { value: pixelRatio },
    uCoreColor: { value: new THREE.Color(PULSAR_COLORS.core) },
    uHaloColor: { value: new THREE.Color(PULSAR_COLORS.halo) },
    uBeamColor: { value: new THREE.Color(PULSAR_COLORS.beam) },
    uDeepColor: { value: new THREE.Color(PULSAR_COLORS.deepBeam) },
  };
  const background = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    vertexShader: backgroundVertexShader, fragmentShader: backgroundFragmentShader,
    depthTest: false, depthWrite: false,
  }));
  background.frustumCulled = false;
  background.renderOrder = -100;
  const star = createStar(uniforms);
  const beams = createBeam(uniforms, settings.particleCount);
  const spinGroup = new THREE.Group();
  spinGroup.add(beams.group);
  const nebulae = createNebula(uniforms);
  scene.add(background, createStarfield(uniforms), ...nebulae, star.group, spinGroup);
  if (options.transparent) {
    // Keep the canvas transparent; the landing supplies its own star field.
    background.visible = false;
    nebulae.forEach(nebula => { nebula.visible = false; });
    scene.children.find(object => object.isPoints).visible = false;
  }
  // Soft lighting also supports an optional replacement GLB/GLTF model.
  scene.add(new THREE.HemisphereLight(0xbfeaff, 0x3e235f, 2));
  const softLight = new THREE.DirectionalLight(0xdaf5ff, 2.4);
  softLight.position.set(4, 6, 5);
  scene.add(softLight);
  const { composer, bloom, finishing, passes } = setupPostProcessing(renderer, scene, camera, settings);
  finishing.uniforms.uTransparent.value = options.transparent ? 1 : 0;
  let modelLoaded = !options.modelUrl;
  function disposeObject(object) {
    object.traverse(child => {
      child.geometry?.dispose();
      const materials = child.material ? (Array.isArray(child.material) ? child.material : [child.material]) : [];
      for (const material of materials) {
        for (const value of Object.values(material)) if (value?.isTexture) value.dispose();
        material.dispose();
      }
    });
  }
  if (options.modelUrl) {
    import('three/addons/loaders/GLTFLoader.js').then(({ GLTFLoader }) => new GLTFLoader().loadAsync(options.modelUrl)).then(gltf => {
      if (disposed || failed) { disposeObject(gltf.scene); return; }
      const box = new THREE.Box3().setFromObject(gltf.scene);
      const size = box.getSize(new THREE.Vector3());
      const scale = 11 / Math.max(size.x, size.y, size.z, 0.001);
      const center = box.getCenter(new THREE.Vector3());
      gltf.scene.scale.setScalar(scale);
      gltf.scene.position.copy(center).multiplyScalar(-scale);
      const normalized = new THREE.Group();
      normalized.add(gltf.scene);
      spinGroup.add(normalized);
      star.group.visible = false;
      beams.group.visible = false;
      modelLoaded = true;
      requestRender();
    }).catch(reportError);
  }
  const hotspotPoints = (options.hotspots || []).map(hotspot => ({ ...hotspot, point: new THREE.Vector3(...hotspot.position) }));
  const projected = new THREE.Vector3();

  function reportError(error) {
    if (disposed || failed) return;
    failed = true;
    cancelAnimationFrame(frame);
    frame = 0;
    canvas.dataset.ready = 'false';
    options.onError?.(error);
  }

  renderer.debug.onShaderError = (gl, program) => {
    reportError(new Error(`Não foi possível compilar o visual 3D: ${gl.getProgramInfoLog(program) || 'shader indisponível'}`));
  };

  function requestRender() {
    if (!disposed && !failed && !document.hidden && inView && !frame) {
      frame = requestAnimationFrame(animate);
    }
  }

  function updateUniforms() {
    uniforms.uTime.value = time;
    uniforms.uPulse.value = 1 + Math.sin(spin * 2) * 0.065;
    uniforms.uWidth.value = settings.beamWidth;
    spinGroup.rotation.set(0, spin, Math.sin(time * 0.11) * 0.016);
    beams.group.rotation.z = -THREE.MathUtils.degToRad(settings.inclination + Math.sin(time * 0.14) * 1.0);
    star.core.scale.setScalar(1 + Math.sin(spin * 2) * 0.02);
    star.halo.quaternion.copy(camera.quaternion);
    for (const nebula of nebulae) nebula.quaternion.copy(camera.quaternion);
    finishing.uniforms.uTime.value = time;
  }

  // Time advances only while visible and running; pause freezes the actual
  // simulation (including grain and plume noise), while controls still work.
  function animate(now) {
    frame = 0;
    if (disposed || failed || document.hidden || !inView) return;
    const delta = lastNow ? Math.min((now - lastNow) / 1000, 0.06) : 0;
    lastNow = now;
    if (!paused) {
      time += delta;
      spin += delta * settings.rotationSpeed;
    }
    const controlsChanged = controls.update(delta);
    updateUniforms();
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    options.onHotspots?.(hotspotPoints.map(hotspot => {
      projected.copy(hotspot.point);
      if (hotspot.space === 'beam') beams.group.localToWorld(projected);
      projected.project(camera);
      return { x: (projected.x + 1) * width / 2, y: (1 - projected.y) * height / 2, visible: modelLoaded && projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1 };
    }));
    renderer.info.reset();
    try {
      composer.render(delta);
    } catch (error) {
      reportError(error);
      return;
    }
    if (failed || disposed) return;
    if (!ready && modelLoaded) {
      ready = true;
      canvas.dataset.ready = 'true';
      options.onReady?.();
    }
    if (paused || time - datasetTime >= 0.2) {
      canvas.dataset.time = time.toFixed(3);
      datasetTime = time;
    }
    // Reduce fill rate only after sustained slow frames; no geometry is
    // rebuilt, and the slider values and simulation speed remain unchanged.
    if (!paused && delta > 0) {
      frameCost += delta;
      adaptationFrames++;
      if (adaptationFrames >= 180) {
        if (frameCost / adaptationFrames > 0.027 && pixelRatio > 1) {
          pixelRatio = Math.max(1, pixelRatio - 0.2);
          renderer.setPixelRatio(pixelRatio);
          composer.setPixelRatio(pixelRatio);
          uniforms.uPixelRatio.value = pixelRatio;
        }
        frameCost = 0;
        adaptationFrames = 0;
      }
    }
    if (!paused || controlsChanged) requestRender();
  }

  function resize() {
    if (disposed) return;
    const rect = container.getBoundingClientRect();
    width = Math.max(1, Math.round(rect.width));
    height = Math.max(1, Math.round(rect.height));
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    composer.setSize(width, height);
    requestRender();
  }

  function visibilityChanged() {
    lastNow = 0;
    if (document.hidden || !inView) {
      cancelAnimationFrame(frame);
      frame = 0;
    } else requestRender();
  }

  function contextLost(event) {
    event.preventDefault();
    reportError(new Error('O contexto WebGL foi interrompido. Recarregue a visualização para continuar.'));
  }

  function focusCanvas() { canvas.focus({ preventScroll: true }); }

  function zoomWithKeyboard(event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === '+' || event.key === '=' || event.code === 'NumpadAdd') {
      event.preventDefault();
      controls.dollyIn(0.93);
    } else if (event.key === '-' || event.key === '_' || event.code === 'NumpadSubtract') {
      event.preventDefault();
      controls.dollyOut(0.93);
    }
  }

  controls.addEventListener('change', requestRender);
  controls.addEventListener('start', requestRender);
  canvas.addEventListener('pointerdown', focusCanvas);
  canvas.addEventListener('keydown', zoomWithKeyboard);
  canvas.addEventListener('webglcontextlost', contextLost);
  document.addEventListener('visibilitychange', visibilityChanged);
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  const intersectionObserver = new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    visibilityChanged();
  }, { rootMargin: '80px' });
  intersectionObserver.observe(container);
  resize();

  return {
    setSettings(partial) {
      if (disposed) return;
      settings = sanitizeSettings(settings, partial);
      bloom.strength = settings.bloom;
      beams.particles.geometry.setDrawRange(0, settings.particleCount);
      requestRender();
    },
    setPaused(value) {
      if (disposed) return;
      paused = Boolean(value);
      controls.autoRotate = Boolean(options.autoRotate) && !paused;
      lastNow = 0;
      canvas.dataset.time = time.toFixed(3);
      requestRender();
    },
    resetCamera() {
      if (disposed) return;
      // Flush rotation/pan momentum through the public API before resetting;
      // OrbitControls.reset() alone leaves its damping deltas in place.
      controls.enableDamping = false;
      controls.update();
      controls.reset();
      controls.target.set(0, 0, 0);
      camera.position.copy(initialPosition);
      camera.zoom = 1;
      camera.updateProjectionMatrix();
      controls.update();
      controls.enableDamping = true;
      requestRender();
    },
    getState() {
      return {
        paused, ready, disposed, failed, settings: { ...settings }, time,
        camera: camera.position.toArray(), target: controls.target.toArray(),
        particleCount: beams.particles.geometry.drawRange.count,
        drawCalls: renderer.info.render.calls, pixelRatio, width, height,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener('visibilitychange', visibilityChanged);
      canvas.removeEventListener('webglcontextlost', contextLost);
      canvas.removeEventListener('pointerdown', focusCanvas);
      canvas.removeEventListener('keydown', zoomWithKeyboard);
      controls.removeEventListener('change', requestRender);
      controls.removeEventListener('start', requestRender);
      controls.dispose();
      disposeObject(scene);
      for (const pass of passes) pass.dispose?.();
      composer.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}

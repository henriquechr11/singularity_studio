import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import modelUrl from '../assets/black_hole.draco.glb?url'
import { cameraPose, CLOSE_POSE, FLIGHT, smoothstep } from './cameraPath'

const lensShader = {
  uniforms: {
    tDiffuse: { value: null },
    aspect: { value: 1 },
    plunge: { value: 0 },
    darkness: { value: 0 },
    radius: { value: 0.08 },
    center: { value: new THREE.Vector2(0.5, 0.5) },
  },
  vertexShader: `varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float aspect, plunge, darkness, radius;
    uniform vec2 center;
    varying vec2 vUv;
    void main() {
      vec2 d = vUv - center;
      vec2 spherical = d * vec2(aspect, 1.);
      float r = length(spherical);
      float bend = exp(-abs(r - radius * 1.4) * 18.) * .075;
      vec2 uv = center + d * (1. - bend - plunge * .045);
      vec2 split = d * plunge * .014;
      vec3 color = vec3(texture2D(tDiffuse, uv + split).r,
                        texture2D(tDiffuse, uv).g,
                        texture2D(tDiffuse, uv - split).b);
      vec3 streak = vec3(0.);
      for (int i = 1; i <= 5; i++) {
        streak += texture2D(tDiffuse, center + (uv - center) * (1. - float(i) * .025 * plunge)).rgb;
      }
      color = mix(color, streak / 5., plunge * .45);
      // Keep the event horizon dark without suppressing the bright disk
      // crossing in front of it; bloom otherwise fills the entire shadow.
      float shadow = (1. - smoothstep(radius * .78, radius, r))
        * (1. - smoothstep(.07, .4, dot(color, vec3(.2126, .7152, .0722))));
      color *= 1. - shadow * .96;
      color *= 1. - smoothstep(.3, 1.1, length((vUv - .5) * vec2(aspect, 1.))) * .35;
      gl_FragColor = vec4(color * (1. - darkness), 1.);
    }`,
}

function disposeObjects(scene) {
  const geometries = new Set(), materials = new Set(), textures = new Set()
  scene.traverse(object => {
    if (object.geometry) geometries.add(object.geometry)
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material) continue
      materials.add(material)
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value)
    }
  })
  textures.forEach(texture => { texture.dispose(); texture.source?.data?.close?.() })
  materials.forEach(material => material.dispose())
  geometries.forEach(geometry => geometry.dispose())
}

export async function createScene({ canvas, quality, signal, onProgress }) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: false, antialias: false, powerPreference: quality === 'high' ? 'high-performance' : 'low-power' })
  renderer.setClearColor('#030407')
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.15
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(44, 1, 0.015, 250)
  const modelGroup = new THREE.Group()
  const diskTime = { value: 0 }
  scene.add(modelGroup, new THREE.AmbientLight(0xffc49c, 0.65))
  const draco = new DRACOLoader()
  draco.setDecoderPath({ js: `${import.meta.env.BASE_URL}draco/draco_wasm_wrapper.js`, wasm: `${import.meta.env.BASE_URL}draco/draco_decoder.wasm` })
  draco.setWorkerLimit(2)
  let composer, bloom, lens, output, renderPass, disposed = false
  const dispose = () => {
    if (disposed) return
    disposed = true
    disposeObjects(scene)
    for (const pass of [bloom, lens, output, renderPass]) pass?.dispose?.()
    composer?.dispose()
    draco.dispose()
    renderer.dispose()
  }
  try {
    onProgress(8)
    const response = await fetch(modelUrl, { signal })
    if (!response.ok) throw new Error(`Model HTTP ${response.status}`)
    const total = Number(response.headers.get('content-length'))
    let buffer
    if (response.body && total) {
      const reader = response.body.getReader(), chunks = []
      let bytes = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value); bytes += value.length
        onProgress(Math.min(75, 8 + Math.round(bytes / total * 67)))
      }
      const joined = new Uint8Array(bytes)
      let offset = 0
      for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.length }
      buffer = joined.buffer
    } else buffer = await response.arrayBuffer()
    onProgress(78)
    const gltf = await new GLTFLoader().setDRACOLoader(draco).parseAsync(buffer, '')
    modelGroup.add(gltf.scene)
    signal.throwIfAborted()
    // The source's outer accretion disk is ~3,300 units across.
    // Preserve its geometry and authored inclination, normalizing world size.
    const bounds = new THREE.Box3().setFromObject(gltf.scene)
    const size = bounds.getSize(new THREE.Vector3())
    const scale = 10.8 / Math.max(size.x, size.y, size.z)
    gltf.scene.scale.multiplyScalar(scale)
    gltf.scene.position.sub(bounds.getCenter(new THREE.Vector3()).multiplyScalar(scale))
    gltf.scene.traverse(object => {
      if (!object.isMesh) return
      const material = object.material
      if (material.name.includes('distortion')) object.visible = false
      if (material.name.includes('center')) {
        material.color.set('#000000'); material.opacity = 1; material.transparent = false
      }
      if (material.emissiveMap) {
        material.color.set('#000000')
        material.emissive.set('#ff9c52')
        material.emissiveIntensity = material.name.includes('light1') ? 2.6 : 1.8
      }
      if (material.name.startsWith('ring')) {
        material.emissiveMap = material.map
        material.emissive.set('#ff9f5b')
        material.emissiveIntensity = material.name === 'ring' ? 1.1 : 0.6
        material.depthWrite = false
      }
      if (material.name.includes('light') || material.name.startsWith('ring')) {
        // Keep the GLB's disk geometry, UVs and alpha silhouettes, but replace
        // the legacy flat lighting with flowing, amber accretion bands.
        material.onBeforeCompile = shader => {
          shader.uniforms.diskTime = diskTime
          shader.vertexShader = `varying vec3 vDiskPosition;\n${shader.vertexShader}`
          shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvDiskPosition = position / 1700.;')
          shader.fragmentShader = `
            uniform float diskTime;
            varying vec3 vDiskPosition;
            float diskHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
            float diskNoise(vec2 p) {
              vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
              return mix(mix(diskHash(i), diskHash(i + vec2(1., 0.)), f.x), mix(diskHash(i + vec2(0., 1.)), diskHash(i + 1.), f.x), f.y);
            }
            ${shader.fragmentShader}`
          shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
            float diskR = length(vDiskPosition.xy);
            float diskA = atan(vDiskPosition.y, vDiskPosition.x);
            float turbulence = diskNoise(vec2(diskR * 115., diskA * 12. - diskTime * .18));
            turbulence += .45 * diskNoise(vec2(diskR * 250., diskA * 29. - diskTime * .25));
            float band = .5 + .5 * sin(diskR * 720. + turbulence * 5.);
            float innerEdge = smoothstep(.19, .28, diskR);
            float falloff = 1. - smoothstep(.32, 1.02, diskR);
            float heat = exp(-abs(diskR - .3) * 7.);
            vec3 amber = mix(vec3(1., .17, .025), vec3(1., .69, .29), heat * .8);
            outgoingLight = amber * (1.2 + heat * 2.) * innerEdge * falloff * (.22 + turbulence * .65) * (.38 + band * .62);
            #include <opaque_fragment>
          `)
        }
        material.customProgramCacheKey = () => 'cinematic-accretion-v1'
      }
      material.side = THREE.DoubleSide
    })
    // An opaque horizon prevents stars from showing through the source's
    // translucent center. The source meshes still provide the disk and arcs.
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.3, 64, 40), new THREE.MeshBasicMaterial({ color: '#000000' })))
    const photonRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.315, 0.012, 12, 256),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 1.65, 0.55) }),
    )
    scene.add(photonRing)
    const lensMaterial = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
    lensMaterial.onBeforeCompile = shader => {
      shader.uniforms.diskTime = diskTime
      shader.vertexShader = `varying vec2 vLensPosition;\n${shader.vertexShader}`
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvLensPosition = position.xy;')
      shader.fragmentShader = `uniform float diskTime; varying vec2 vLensPosition;\n${shader.fragmentShader}`
      shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
        float lensR = length(vLensPosition);
        float lensA = atan(vLensPosition.y, vLensPosition.x);
        float flow = sin(lensA * 19. + lensR * 145. - diskTime * .12);
        float filaments = .5 + .5 * sin(lensR * 1550. + flow * 2.);
        float envelope = smoothstep(1.307, 1.32, lensR) * (1. - smoothstep(1.345, 1.43, lensR));
        outgoingLight = vec3(2.5, 1.65, .85) * (.35 + filaments * .65);
        diffuseColor.a = envelope * .8;
        #include <opaque_fragment>
      `)
    }
    lensMaterial.customProgramCacheKey = () => 'lensed-accretion-v1'
    const lensedDisk = new THREE.Mesh(new THREE.RingGeometry(1.307, 1.43, 256, 4), lensMaterial)
    scene.add(lensedDisk)
    const positions = [], colors = []
    let seed = 38191
    const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296 }
    for (let i = 0; i < (quality === 'high' ? 1600 : 550); i++) {
      const theta = random() * Math.PI * 2, y = random() * 2 - 1, radius = 65 + random() * 55
      positions.push(Math.cos(theta) * Math.sqrt(1 - y * y) * radius, y * radius, Math.sin(theta) * Math.sqrt(1 - y * y) * radius)
      const light = 0.25 + random() * 0.7
      colors.push(light * 0.8, light * 0.86, light)
    }
    const starGeometry = new THREE.BufferGeometry()
    starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    starGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({ size: 0.085, vertexColors: true, sizeAttenuation: true }))
    scene.add(stars)
    if (quality === 'high') {
      composer = new EffectComposer(renderer)
      renderPass = new RenderPass(scene, camera)
      bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.35, 1)
      lens = new ShaderPass(lensShader)
      output = new OutputPass()
      composer.addPass(renderPass); composer.addPass(bloom); composer.addPass(lens); composer.addPass(output)
    }
    let elapsed = 0, entry = { ...CLOSE_POSE }, controlled = false, tier = quality
    const projectedCenter = new THREE.Vector3()
    const resize = () => {
      const width = canvas.clientWidth, height = canvas.clientHeight
      camera.aspect = width / Math.max(1, height)
      camera.updateProjectionMatrix()
      const pixelRatio = Math.min(window.devicePixelRatio || 1, tier === 'high' ? 1.5 : 1)
      renderer.setPixelRatio(pixelRatio)
      renderer.setSize(width, height, false)
      composer?.setPixelRatio(pixelRatio)
      composer?.setSize(width, height)
      if (lens) lens.uniforms.aspect.value = camera.aspect
    }
    resize()
    const render = ({ progress, delta, scrollControlled, paused }) => {
      if (disposed) return null
      if (!paused) elapsed += delta
      diskTime.value = elapsed
      let pose
      if (!scrollControlled && !controlled) {
        // Settle into the close shot, then hold its framing until scrolling.
        const ease = smoothstep(0, 4, elapsed)
        entry = { x: CLOSE_POSE.x - ease * 0.025, y: CLOSE_POSE.y, z: CLOSE_POSE.z - ease * 0.06 }
        pose = cameraPose(0, camera.aspect, entry)
      } else {
        controlled = true
        pose = cameraPose(progress, camera.aspect, entry)
      }
      // Progress is already damped by the scroll controller. All effects and
      // camera coordinates use that same value to stay synchronized.
      camera.position.set(pose.x, pose.y, pose.z)
      camera.fov = pose.fov
      camera.lookAt(0, 0, 0)
      camera.rotateZ(pose.roll)
      const width = canvas.clientWidth, height = canvas.clientHeight
      camera.setViewOffset(width, height, -width * pose.offset, 0, width, height)
      camera.updateProjectionMatrix()
      camera.updateMatrixWorld()
      projectedCenter.set(0, 0, 0).project(camera)
      photonRing.quaternion.copy(camera.quaternion)
      // At this close distance a ring in the equatorial plane disappears
      // behind the sphere. Place it on the sphere's apparent silhouette.
      const distanceSquared = camera.position.lengthSq()
      const tangent = 1.3 * 1.3 / distanceSquared
      photonRing.position.copy(camera.position).multiplyScalar(tangent)
      photonRing.scale.setScalar(Math.sqrt(Math.max(0.0001, 1 - tangent)))
      photonRing.visible = tangent < 0.99
      lensedDisk.position.copy(photonRing.position)
      lensedDisk.quaternion.copy(photonRing.quaternion)
      lensedDisk.scale.copy(photonRing.scale)
      lensedDisk.visible = photonRing.visible
      const plunge = smoothstep(0.65, FLIGHT.enter, progress)
      if (lens) {
        lens.uniforms.plunge.value = plunge
        lens.uniforms.darkness.value = smoothstep(FLIGHT.blackoutStart, FLIGHT.blackoutEnd, progress)
        lens.uniforms.center.value.set(projectedCenter.x * 0.5 + 0.5, projectedCenter.y * 0.5 + 0.5)
        lens.uniforms.radius.value = Math.min(1.5, 0.65 / (camera.position.length() * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))))
      }
      if (bloom) bloom.strength = 0.5 + plunge * 0.6
      if (composer && tier === 'high') composer.render(delta)
      else renderer.render(scene, camera)
      return { distance: camera.position.length(), fov: camera.fov, centerX: projectedCenter.x * 0.5 + 0.5 }
    }
    render({ progress: 0, delta: 0, scrollControlled: false, paused: false })
    onProgress(100)
    return { render, resize, dispose, downgrade: () => { tier = 'low'; resize() } }
  } catch (error) {
    dispose()
    throw error
  }
}

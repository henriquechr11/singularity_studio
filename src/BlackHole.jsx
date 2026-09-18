import { useEffect, useRef, useState } from 'react'

const vertex = `attribute vec2 position;void main(){gl_Position=vec4(position,0.,1.);}`
const fragment = `
precision highp float;
uniform vec2 resolution;
uniform vec2 pointer;
uniform float time;
uniform float zoom;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
float fbm(vec2 p){return noise(p)*.55+noise(p*2.1)*.25+noise(p*4.2)*.125+noise(p*8.4)*.0625;}
void main(){
 vec2 uv=(gl_FragCoord.xy-.5*resolution)/min(resolution.x,resolution.y);
 uv/=zoom;uv-=pointer*.025;
 float angle=-.25+pointer.x*.07;
 uv=mat2(cos(angle),-sin(angle),sin(angle),cos(angle))*uv;
 float r=length(uv);float a=atan(uv.y,uv.x);
 vec3 col=vec3(.022,.024,.029);
 vec2 sky=uv*(1.+.016/max(r*r,.01));
 vec2 stars=sky*160.;float s=hash(floor(stars));
 float star=pow(max(0.,1.-length(fract(stars)-.5)*2.),8.);
 col+=vec3(.6,.67,.78)*star*step(.987,s)*(.4+.3*sin(time*.4+s*100.));
 float horizon=.237;
 col+=vec3(.95,.22,.035)*exp(-abs(r-horizon)*14.)*.12;
 float ring=exp(-abs(r-horizon)*190.);
 float lensNoise=fbm(vec2(a*14.-time*.08,r*120.));
 col+=vec3(1.,.47,.17)*ring*(.8+lensNoise);
 col+=vec3(1.,.29,.075)*exp(-abs(r-.248)*68.)*(.24+lensNoise*.32);
 // Analytic 3D scene: perspective camera, spherical horizon, planar accretion disk.
 vec3 camera=vec3(pointer.x*.35,1.6+pointer.y*.6,7.);
 vec3 forward=normalize(-camera);
 vec3 right=normalize(cross(forward,vec3(0.,1.,0.)));
 vec3 up=cross(right,forward);
 vec3 ray=normalize(forward*1.8+right*uv.x+up*uv.y);
 float b=dot(camera,ray);
 float discriminant=b*b-dot(camera,camera)+.94*.94;
 float sphereDistance=discriminant>0.?-b-sqrt(discriminant):1000.;
 float diskDistance=-camera.y/(abs(ray.y)<.0001?-.0001:ray.y);
 vec3 hit=camera+ray*diskDistance;
 float diskR=length(hit.xz)*.252;
 float diskA=atan(hit.z,hit.x);
 float texture=fbm(vec2(diskR*100.,diskA*10.-time*.14));
 float fine=sin(diskR*430.+texture*7.-time*.25)*.13+.87;
 float disk=smoothstep(.25,.28,diskR)*(1.-smoothstep(.35,.85,diskR));
 float visible=step(0.,diskDistance)*step(diskDistance,sphereDistance);
 float intensity=disk*visible*(.35+texture*1.6)*fine;
 vec3 diskColor=vec3(1.65,.48,.115)*intensity*(.85+uv.x*.5);
 float band=exp(-abs(uv.y)*105.)*exp(-abs(uv.x)*2.7);
 col+=vec3(1.,.43,.12)*band*.6*smoothstep(.21,.26,r);
 if(discriminant>0.){col*=smoothstep(horizon-.006,horizon,r);}
 col+=diskColor;
 float bentR=length(vec2(uv.x,uv.y*1.13));
 float arc=exp(-abs(bentR-.266)*110.)*smoothstep(-.08,.15,uv.y);
 col+=vec3(1.,.51,.24)*arc*(.6+fbm(vec2(a*25.+time*.08,r*100.))*.7);
 col+=vec3(.09,.035,.11)*exp(-abs(r-.32)*22.);
 col+=(hash(gl_FragCoord.xy+fract(time)*300.)-.5)*.025;
 col*=1.-smoothstep(.55,1.2,r)*.8;
 gl_FragColor=vec4(col,1.);
}`

export default function BlackHole({ onProgress, exploring, zoom, paused, active = true }) {
  const canvasRef = useRef(null)
  const [reducedMotion, setReducedMotion] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  const values = useRef({ zoom, paused, active })
  useEffect(() => { values.current = { zoom, paused, active } }, [zoom, paused, active])
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const change = () => setReducedMotion(media.matches)
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [])
  useEffect(() => {
    const canvas = canvasRef.current
    if (reducedMotion) { canvas.style.opacity = '0'; onProgress(100); return }
    let gl
    try { gl = canvas.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'low-power' }) } catch { /* CSS fallback remains visible. */ }
    if (!gl) { onProgress(100); return }
    onProgress(25)
    const shaders = []
    const compile = (type, source) => {
      const shader = gl.createShader(type)
      gl.shaderSource(shader, source); gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { gl.deleteShader(shader); throw new Error('Shader unavailable') }
      shaders.push(shader); return shader
    }
    const program = gl.createProgram()
    try {
      gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex))
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment))
      gl.linkProgram(program)
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('WebGL unavailable')
    } catch { shaders.forEach(s => gl.deleteShader(s)); gl.deleteProgram(program); onProgress(100); return }
    onProgress(65)
    gl.useProgram(program)
    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW)
    const position = gl.getAttribLocation(program, 'position')
    gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0)
    const uniforms = Object.fromEntries(['resolution','pointer','time','zoom'].map(n => [n,gl.getUniformLocation(program,n)]))
    const reduced = matchMedia('(prefers-reduced-motion: reduce)')
    let target = [0, 0], current = [0, 0], frame, last = 0, elapsed = 0, visible = true, scroll = 0
    const resize = () => { const dpr = Math.min(devicePixelRatio, 1.5); canvas.width = Math.round(canvas.clientWidth*dpr); canvas.height = Math.round(canvas.clientHeight*dpr); gl.viewport(0,0,canvas.width,canvas.height) }
    const move = e => { const rect = canvas.getBoundingClientRect(); target = [(e.clientX-rect.left)/rect.width-.5, .5-(e.clientY-rect.top)/rect.height] }
    const onScroll = () => { scroll = Math.min(window.scrollY / innerHeight, 1) }
    const observer = new ResizeObserver(resize); observer.observe(canvas)
    const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting }); intersection.observe(canvas)
    const contextLost = e => { e.preventDefault(); canvas.style.opacity = '0'; cancelAnimationFrame(frame) }
    canvas.addEventListener('webglcontextlost',contextLost)
    canvas.addEventListener('pointermove',move)
    window.addEventListener('scroll',onScroll,{passive:true})
    resize()
    const draw = now => {
      frame = requestAnimationFrame(draw)
      if(now-last<32) return
      const delta = Math.min((now-last)/1000,.05); last = now
      if(!visible || document.hidden || !values.current.active) return
      if(!reduced.matches && !values.current.paused) elapsed+=delta
      current=current.map((v,i)=>v+(target[i]-v)*.045)
      gl.uniform2f(uniforms.resolution,canvas.width,canvas.height)
      gl.uniform2f(uniforms.pointer,reduced.matches?0:current[0],reduced.matches?0:current[1])
      gl.uniform1f(uniforms.time,elapsed)
      gl.uniform1f(uniforms.zoom, values.current.zoom+(reduced.matches?0:scroll*.06))
      gl.drawArrays(gl.TRIANGLES,0,6)
    }
    draw(performance.now()); canvas.style.opacity='1'; onProgress(100)
    return () => { cancelAnimationFrame(frame); observer.disconnect(); intersection.disconnect(); canvas.removeEventListener('pointermove',move); canvas.removeEventListener('webglcontextlost',contextLost); window.removeEventListener('scroll',onScroll); gl.deleteBuffer(buffer); gl.deleteProgram(program); shaders.forEach(s=>gl.deleteShader(s)) }
  }, [onProgress, reducedMotion])
  return <div className={`black-hole ${exploring ? 'is-exploring' : ''}`}><div className="hole-fallback" aria-hidden="true"><i /></div><canvas ref={canvasRef} aria-label="Buraco negro interativo: disco de acreção âmbar e horizonte de eventos" role="img" /></div>
}

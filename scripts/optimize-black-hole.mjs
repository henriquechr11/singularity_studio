import { readFile, writeFile, mkdir, copyFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, draco, prune, simplify, textureCompress, weld } from '@gltf-transform/functions'
import draco3d from 'draco3dgltf'
import { MeshoptSimplifier } from 'meshoptimizer'
import sharp from 'sharp'

// Keep the artist's original untouched. Migrate its legacy material extension
// before optimizing, since modern GLTFLoader uses metallic/roughness materials.
const source = new URL('../src/assets/black_hole.glb', import.meta.url)
const target = new URL('../src/assets/black_hole.draco.glb', import.meta.url)
const original = await readFile(source)
const jsonLength = original.readUInt32LE(12)
const json = JSON.parse(original.subarray(20, 20 + jsonLength).toString())
const legacy = 'KHR_materials_pbrSpecularGlossiness'
for (const material of json.materials) {
  const old = material.extensions?.[legacy]
  if (!old) continue
  material.pbrMetallicRoughness = {
    baseColorFactor: old.diffuseFactor || [1, 1, 1, 1],
    ...(old.diffuseTexture ? { baseColorTexture: old.diffuseTexture } : {}),
    metallicFactor: 0,
    roughnessFactor: 1 - (old.glossinessFactor || 0),
  }
  delete material.extensions[legacy]
}
json.extensionsUsed = json.extensionsUsed.filter(name => name !== legacy)
if (json.extensionsRequired) json.extensionsRequired = json.extensionsRequired.filter(name => name !== legacy)
const encoded = Buffer.from(JSON.stringify(json))
const padded = Buffer.alloc(Math.ceil(encoded.length / 4) * 4, 0x20)
encoded.copy(padded)
const binaryChunk = original.subarray(20 + jsonLength)
const header = Buffer.alloc(20)
header.writeUInt32LE(0x46546c67, 0)
header.writeUInt32LE(2, 4)
header.writeUInt32LE(20 + padded.length + binaryChunk.length, 8)
header.writeUInt32LE(padded.length, 12)
header.writeUInt32LE(0x4e4f534a, 16)
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.encoder': await draco3d.createEncoderModule(),
  'draco3d.decoder': await draco3d.createDecoderModule(),
})
const document = await io.readBinary(Buffer.concat([header, padded, binaryChunk]))
// A distant decorative planet unnecessarily expands the framing bounds.
for (const node of document.getRoot().listNodes()) {
  if (/^Planet/.test(node.getName())) node.dispose()
}
await MeshoptSimplifier.ready
await document.transform(
  prune(), dedup(), weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: 0.4, error: 0.0005 }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 85 }),
  draco({ method: 'edgebreaker', encodeSpeed: 5, decodeSpeed: 5 }),
)
await io.write(fileURLToPath(target), document)
const decoderDir = new URL('../public/draco/', import.meta.url)
await mkdir(decoderDir, { recursive: true })
for (const name of ['draco_wasm_wrapper.js', 'draco_decoder.wasm']) {
  await copyFile(new URL(`../node_modules/three/examples/jsm/libs/draco/gltf/${name}`, import.meta.url), new URL(name, decoderDir))
}
await writeFile(new URL('../public/model-credits.txt', import.meta.url), `Black Hole by NestaEric\nhttps://sketchfab.com/3d-models/black-hole-e410da98b1e5445eae2acafaaa53587d\nLicense: CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/\nAdaptations: legacy material conversion, removal of distant planet, mesh simplification, WebP textures, Draco compression; additional cinematic lighting and effects.\n`)
const bytes = (await stat(target)).size
console.log(`Black hole: ${(original.length / 1e6).toFixed(2)} MB → ${(bytes / 1e6).toFixed(2)} MB (${(100 * (1 - bytes / original.length)).toFixed(1)}% smaller).`)

/**
 * Builds Three.js meshes from a StructureModel.
 */

import * as THREE from 'three'
import type { StructureModel, Pillar, Purlin, TieBeam, Rafter, RidgeTie, KneeBrace } from '../model/types'
import { PILLAR_SIZE, PURLIN_SIZE, RAFTER_WIDTH, RAFTER_DEPTH, RIDGE_TIE_WIDTH, KNEE_BRACE_SIZE, KNEE_BRACE_LENGTH } from '../model/structure'
import { EAVE_PLUMB_HEIGHT } from '../model/geometry'
import { LAMBERIA_HEIGHT, LAMBERIA_WIDTH } from '../model/roofing'

// const COLOR = '#0c83fa' 

const MAT: Record<string, THREE.MeshLambertMaterial> = {
  pillar:   new THREE.MeshLambertMaterial({ color: 0x5a3a1a }),
  purlin:   new THREE.MeshLambertMaterial({ color: 0x7a5030 }),
  rafter:   new THREE.MeshLambertMaterial({ color: 0x9b6840 }),
  lamberia: new THREE.MeshLambertMaterial({ color: 0x7a5030 }),
  // pillar:  new THREE.MeshLambertMaterial({ color: COLOR }),
  // purlin:  new THREE.MeshLambertMaterial({ color: COLOR }),
  // rafter:  new THREE.MeshLambertMaterial({ color: COLOR }),
}

export interface RoofRenderOptions {
  lamberia?: boolean
}

export function buildRoofMeshes(model: StructureModel, options?: RoofRenderOptions): THREE.Group {
  const group = new THREE.Group()

  for (const p of model.pillars)      group.add(pillarMesh(p))
  for (const p of model.basePurlins)  group.add(purlinMesh(p))
  for (const tb of model.tieBeams)    group.add(tieBeamMesh(tb))
  for (const r of model.rafters)      group.add(rafterMesh(r, model.params.pitch))
  for (const rt of model.ridgeTies)   group.add(ridgeTieMesh(rt))
  for (const kb of model.kneeBraces)  group.add(kneeBraceMesh(kb))
  group.add(purlinMesh(model.ridgePurlin))

  if (options?.lamberia) {
    const lamberiaMeshes = buildLamberiaMeshes(model)
    for (const m of lamberiaMeshes) group.add(m)
  }

  return group
}

export function disposeMaterials(): void {
  for (const mat of Object.values(MAT)) mat.dispose()
}

// ── Per-element mesh builders ─────────────────────────────────────────────────

function pillarMesh(p: Pillar): THREE.Mesh {
  const geo = new THREE.BoxGeometry(PILLAR_SIZE, p.height, PILLAR_SIZE)
  const mesh = new THREE.Mesh(geo, MAT.pillar)
  mesh.position.set(p.base.x, p.base.y + p.height / 2, p.base.z)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

function purlinMesh(p: Purlin): THREE.Mesh {
  // +2 mm total (1 mm each end) to prevent z-fighting with flush gable rafters
  const len = Math.abs(p.end.x - p.start.x) + 0.002
  const size = p.width
  const geo = new THREE.BoxGeometry(len, size, size)
  const mesh = new THREE.Mesh(geo, MAT.purlin)
  mesh.position.set((p.start.x + p.end.x) / 2, p.start.y, p.start.z)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

function tieBeamMesh(tb: TieBeam): THREE.Mesh {
  const len = Math.abs(tb.end.z - tb.start.z)
  const geo = new THREE.BoxGeometry(PURLIN_SIZE - 0.002, PURLIN_SIZE - 0.002, len)
  const mesh = new THREE.Mesh(geo, MAT.purlin)
  mesh.position.set(
    tb.start.x,
    (tb.start.y + tb.end.y) / 2,
    (tb.start.z + tb.end.z) / 2,
  )
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

/**
 * Custom prism geometry for a rafter with plumb cuts at both ends and a
 * compound eave cut (plumb face + horizontal soffit).
 *
 * Vertex layout (10 vertices, indices 0-9):
 *   0 eave-top-left      6 ridge-top-left
 *   1 eave-top-right     7 ridge-top-right
 *   2 soffit-eave-left   8 ridge-bot-left
 *   3 soffit-eave-right  9 ridge-bot-right
 *   4 soffit-inner-left
 *   5 soffit-inner-right
 *
 * "top/bot" = outward (sky) / inward (ground) face of rafter
 * "left/right" = along X (longitudinal axis)
 * "eave/inner" = soffit vertices at z=eaveEnd.z vs. where soffit meets rafter bottom face
 *
 * Plumb cut formula (both ends): top/bot y = centerY ± RAFTER_DEPTH/(2·cosP)
 * Eave plumb face height: EAVE_PLUMB_HEIGHT (from top of rafter downward)
 *   → y_soffit = eaveEnd.y + RAFTER_DEPTH/(2·cosP) - EAVE_PLUMB_HEIGHT
 * Soffit width: (RAFTER_DEPTH/cosP - EAVE_PLUMB_HEIGHT) / tanP
 *   → z_soffit_inner = eaveEnd.z ± soffit_width  (+ for left, − for right slope)
 *
 * Faces (7): top, bottom, left (pentagon), right (pentagon),
 *            plumb/eave, soffit, ridge
 *
 * Winding: CCW from outside for the left slope.
 * Right slope is a z-mirror of left slope → flip all triangle windings.
 */
function rafterMesh(r: Rafter, pitchDeg: number): THREE.Mesh {
  const DEG  = Math.PI / 180
  const cosP = Math.cos(pitchDeg * DEG)
  const tanP = Math.tan(pitchDeg * DEG)
  const isLeft = r.eaveEnd.z < 0

  const rw = RAFTER_WIDTH  // 0.075 m
  const rd = RAFTER_DEPTH  // 0.15  m
  const x  = r.eaveEnd.x  // same for both ends

  // ── Eave end ──────────────────────────────────────────────────────────────
  const ze  = r.eaveEnd.z
  const ye  = r.eaveEnd.y
  const ety = ye + rd / (2 * cosP)                         // eave top y (plumb cut)
  const esy = ety - EAVE_PLUMB_HEIGHT                      // soffit y (= top - plumb height)
  const swd = (rd / cosP - EAVE_PLUMB_HEIGHT) / tanP       // soffit horizontal width
  const zsi = ze + (isLeft ? swd : -swd)                   // soffit inner z

  // ── Ridge end (vertical / plumb cut at z = 0) ────────────────────────────
  const yr  = r.ridgeEnd.y
  const rty = yr + rd / (2 * cosP) // ridge top y
  const rby = yr - rd / (2 * cosP) // ridge bot y

  // ── Vertices ──────────────────────────────────────────────────────────────
  const pos = new Float32Array([
    x - rw/2, ety, ze,   // 0  eave-top-left
    x + rw/2, ety, ze,   // 1  eave-top-right
    x - rw/2, esy, ze,   // 2  soffit-eave-left
    x + rw/2, esy, ze,   // 3  soffit-eave-right
    x - rw/2, esy, zsi,  // 4  soffit-inner-left
    x + rw/2, esy, zsi,  // 5  soffit-inner-right
    x - rw/2, rty, 0,    // 6  ridge-top-left
    x + rw/2, rty, 0,    // 7  ridge-top-right
    x - rw/2, rby, 0,    // 8  ridge-bot-left
    x + rw/2, rby, 0,    // 9  ridge-bot-right
  ])

  // ── Triangles (CCW from outside, left-slope winding) ─────────────────────
  const tris = [
    0, 6, 7,  0, 7, 1,         // top face    (outward)
    4, 5, 9,  4, 9, 8,         // bottom face (inward, soffit-inner → ridge)
    0, 2, 4,  0, 4, 8,  0, 8, 6,  // left face   (−x, pentagon)
    1, 7, 9,  1, 9, 5,  1, 5, 3,  // right face  (+x, pentagon)
    0, 1, 3,  0, 3, 2,         // plumb face  (eave end, vertical)
    2, 3, 5,  2, 5, 4,         // soffit face (horizontal, downward)
    6, 8, 9,  6, 9, 7,         // ridge face  (vertical, z=0)
  ]

  // Right slope is z-mirrored → reverse each triangle's winding
  if (!isLeft) {
    for (let i = 0; i < tris.length; i += 3) {
      const tmp = tris[i + 1]
      tris[i + 1] = tris[i + 2]
      tris[i + 2] = tmp
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setIndex(tris)
  geo.computeVertexNormals()

  const mesh = new THREE.Mesh(geo, MAT.rafter)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

/**
 * Trapezoid prism geometry for a ridge tie (KAKASULO).
 *
 * 8 vertices, 6 faces. Top is horizontal (narrower), bottom is wider.
 * Sides slope at the pitch angle, flush with the rafter bottom faces.
 *
 * Vertex layout (looking along -X):
 *
 *      0,1 ─────────── 2,3         ← yTop
 *       /                 \
 *      /                   \
 *    4,5 ─────────────── 6,7       ← yBottom
 *
 *  0,4: x - w/2    1,5: x + w/2
 *  0,1: -zHalfTop  2,3: +zHalfTop
 *  4,5: -zHalfBottom  6,7: +zHalfBottom
 */
function ridgeTieMesh(rt: RidgeTie): THREE.Mesh {
  const w = RIDGE_TIE_WIDTH

  const pos = new Float32Array([
    rt.x - w/2, rt.yTop,    -rt.zHalfTop,      // 0 top-left-near
    rt.x + w/2, rt.yTop,    -rt.zHalfTop,      // 1 top-right-near
    rt.x - w/2, rt.yTop,    +rt.zHalfTop,      // 2 top-left-far
    rt.x + w/2, rt.yTop,    +rt.zHalfTop,      // 3 top-right-far
    rt.x - w/2, rt.yBottom, -rt.zHalfBottom,    // 4 bot-left-near
    rt.x + w/2, rt.yBottom, -rt.zHalfBottom,    // 5 bot-right-near
    rt.x - w/2, rt.yBottom, +rt.zHalfBottom,    // 6 bot-left-far
    rt.x + w/2, rt.yBottom, +rt.zHalfBottom,    // 7 bot-right-far
  ])

  // CCW winding from outside
  const tris = [
    0, 2, 3,  0, 3, 1,   // top face (y = yTop, normal up)
    4, 5, 7,  4, 7, 6,   // bottom face (y = yBottom, normal down)
    0, 1, 5,  0, 5, 4,   // front face (-z side, normal -z)
    2, 6, 7,  2, 7, 3,   // back face (+z side, normal +z)
    0, 4, 6,  0, 6, 2,   // left face (-x end)
    1, 3, 7,  1, 7, 5,   // right face (+x end)
  ]

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setIndex(tris)
  geo.computeVertexNormals()

  const mesh = new THREE.Mesh(geo, MAT.rafter)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

function kneeBraceMesh(kb: KneeBrace): THREE.Mesh {
  const geo = new THREE.BoxGeometry(KNEE_BRACE_SIZE, KNEE_BRACE_SIZE, KNEE_BRACE_LENGTH)
  const mesh = new THREE.Mesh(geo, MAT.pillar)

  // Position at midpoint
  mesh.position.set(
    (kb.start.x + kb.end.x) / 2,
    (kb.start.y + kb.end.y) / 2,
    (kb.start.z + kb.end.z) / 2,
  )

  // Build orthonormal basis: local Z = beam direction, local Y = closest to global Y
  const d = new THREE.Vector3(
    kb.end.x - kb.start.x,
    kb.end.y - kb.start.y,
    kb.end.z - kb.start.z,
  ).normalize()
  const up = Math.abs(d.y) > 0.99
    ? new THREE.Vector3(1, 0, 0)
    : new THREE.Vector3(0, 1, 0)
  const right = new THREE.Vector3().crossVectors(up, d).normalize()
  const correctedUp = new THREE.Vector3().crossVectors(d, right)
  const basis = new THREE.Matrix4().makeBasis(right, correctedUp, d)
  mesh.quaternion.setFromRotationMatrix(basis)

  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

// ── Lamberia ──────────────────────────────────────────────────────────────────

/**
 * Builds lamberia plank meshes for both slopes.
 *
 * Each plank is a trapezoid prism running along X for totalLength.
 * Cross-section (perpendicular to slope): wider on top (sky), narrower on
 * bottom (rafter-facing) so gaps are visible between planks.
 *
 * Top width across slope:    LAMBERIA_WIDTH - 0.002 (0.110 m)
 * Bottom width across slope: LAMBERIA_WIDTH - 0.012 (0.100 m)
 * Height (perpendicular to slope): LAMBERIA_HEIGHT (0.016 m)
 */
function buildLamberiaMeshes(model: StructureModel): THREE.Mesh[] {
  const DEG = Math.PI / 180
  const pitch = model.params.pitch * DEG
  const cosP = Math.cos(pitch)
  const sinP = Math.sin(pitch)

  const refLeft = model.rafters[0]
  const rafterLen = refLeft.length
  const planksPerSlope = Math.ceil(rafterLen / LAMBERIA_WIDTH)
  const lastPlankWidth = rafterLen - (planksPerSlope - 1) * LAMBERIA_WIDTH + 0.01
  const halfLen = model.totalLength / 2

  // Taper insets (fixed gap size, independent of plank width)
  const TOP_INSET = 0.001
  const BOT_INSET = 0.022

  // Normal to slope surface (outward), scaled by LAMBERIA_HEIGHT
  // Left slope outward normal points toward -z and +y
  const nhY = cosP * LAMBERIA_HEIGHT
  const nhZ = sinP * LAMBERIA_HEIGHT  // magnitude; sign applied per side

  const meshes: THREE.Mesh[] = []

  for (let side = 0; side < 2; side++) {
    const isLeft = side === 0
    // Left slope: eave is at -z, ridge at z=0, "toward ridge" = +z
    // Right slope: eave is at +z, ridge at z=0, "toward ridge" = -z
    const sign = isLeft ? 1 : -1

    const refRafter = isLeft ? refLeft : model.rafters.find(r => r.eaveEnd.z > 0)!
    const eaveZ = refRafter.eaveEnd.z
    const eaveY = refRafter.eaveEnd.y + RAFTER_DEPTH / (2 * cosP)

    for (let i = 0; i < planksPerSlope; i++) {
      const isLast = i === planksPerSlope - 1
      const plankW = isLast ? lastPlankWidth : LAMBERIA_WIDTH
      const topHalf = (plankW - TOP_INSET) / 2
      const botHalf = (plankW - BOT_INSET) / 2

      // Plank center along slope, measured from eave
      const slopeStart = i * LAMBERIA_WIDTH
      const slopeCenter = slopeStart + plankW / 2

      // Center of plank on rafter surface
      const cz = eaveZ + sign * slopeCenter * cosP
      const cy = eaveY + slopeCenter * sinP

      // Bottom (rafter-facing) edge positions: ±botHalf along slope from center
      const bEaveZ = cz - sign * botHalf * cosP
      const bEaveY = cy - botHalf * sinP
      const bRidgeZ = cz + sign * botHalf * cosP
      const bRidgeY = cy + botHalf * sinP

      // Top (sky-facing) edge positions: ±topHalf along slope + normal offset
      const nz = -sign * nhZ  // outward normal z: left slope = -z, right = +z
      const tEaveZ = cz - sign * topHalf * cosP + nz
      const tEaveY = cy - topHalf * sinP + nhY
      const tRidgeZ = cz + sign * topHalf * cosP + nz
      const tRidgeY = cy + topHalf * sinP + nhY

      const pos = new Float32Array([
        -halfLen, bEaveY,  bEaveZ,   // 0 bot-eave-left
        -halfLen, bRidgeY, bRidgeZ,  // 1 bot-ridge-left
        -halfLen, tEaveY,  tEaveZ,   // 2 top-eave-left
        -halfLen, tRidgeY, tRidgeZ,  // 3 top-ridge-left
        +halfLen, bEaveY,  bEaveZ,   // 4 bot-eave-right
        +halfLen, bRidgeY, bRidgeZ,  // 5 bot-ridge-right
        +halfLen, tEaveY,  tEaveZ,   // 6 top-eave-right
        +halfLen, tRidgeY, tRidgeZ,  // 7 top-ridge-right
      ])

      // 6 faces, CCW from outside
      const tris = isLeft ? [
        2, 3, 7,  2, 7, 6,   // top (sky)
        0, 5, 1,  0, 4, 5,   // bottom (rafter)
        0, 1, 3,  0, 3, 2,   // left end (-x)
        4, 6, 7,  4, 7, 5,   // right end (+x)
        0, 2, 6,  0, 6, 4,   // eave edge
        1, 5, 7,  1, 7, 3,   // ridge edge
      ] : [
        2, 7, 3,  2, 6, 7,   // top (sky)
        0, 1, 5,  0, 5, 4,   // bottom (rafter)
        0, 3, 1,  0, 2, 3,   // left end (-x)
        4, 7, 6,  4, 5, 7,   // right end (+x)
        0, 6, 2,  0, 4, 6,   // eave edge
        1, 7, 5,  1, 3, 7,   // ridge edge
      ]

      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      geo.setIndex(tris)
      geo.computeVertexNormals()

      const mesh = new THREE.Mesh(geo, MAT.lamberia)
      mesh.castShadow = true
      mesh.receiveShadow = true
      meshes.push(mesh)
    }
  }

  return meshes
}

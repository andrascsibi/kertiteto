/**
 * Builds Three.js meshes from a StructureModel.
 */

import * as THREE from 'three'
import type { StructureModel, Pillar, Purlin, TieBeam, Rafter, RidgeTie, KneeBrace } from '../model/types'
import { PILLAR_SIZE, PURLIN_SIZE, RIDGE_TIE_WIDTH, KNEE_BRACE_SIZE } from '../model/structure'
import { EAVE_PLUMB_HEIGHT } from '../model/geometry'
import { LAMBERIA_HEIGHT, LAMBERIA_WIDTH, ROOF_BATTEN_DISTANCE, SHEET_THICKNESS, KORC_HEIGHT, KORC_WIDTH, DRIP_EDGE_FLAT_WIDTH, DRIP_EDGE_VISOR_WIDTH, DRIP_EDGE_VISOR_ANGLE, DRIP_EDGE_THICKNESS, EAVES_FLASHING_VISOR_WIDTH, EAVES_FLASHING_ANGLE, EAVES_FLASHING_THICKNESS, GABLE_FLASHING_SKIRT_HEIGHT, GABLE_FLASHING_SKIRT_THICKNESS, GABLE_FLASHING_CAP_HEIGHT, GABLE_FLASHING_CAP_WIDTH, GABLE_FLASHING_VISOR_WIDTH, GABLE_FLASHING_VISOR_ANGLE, RIDGE_FLASHING_WIDTH, RIDGE_FLASHING_GAP, RIDGE_FLASHING_THICKNESS, RIDGE_CAP_HEIGHT, RIDGE_CAP_GAP, RIDGE_CAP_WIDTH, RIDGE_CAP_X_EXTRA } from '../model/roofing'
import type { RoofingModel } from '../model/roofing'
import { buildAnnotations } from './annotations'

// const COLOR = '#0c83fa' 

const MAT: Record<string, THREE.Material> = {
  pillar:   new THREE.MeshLambertMaterial({ color: 0x5a3a1a }),
  purlin:   new THREE.MeshLambertMaterial({ color: 0x7a5030 }),
  rafter:   new THREE.MeshLambertMaterial({ color: 0x9b6840 }),
  lamberia:  new THREE.MeshLambertMaterial({ color: 0x7a5030 }),
  membrane:  new THREE.MeshLambertMaterial({ color: 0xcccccc }),
  counterBatten: new THREE.MeshLambertMaterial({ color: 0x40e0d0 }),
  metalSheet: new THREE.MeshStandardMaterial({ color: 0xCC6E52, metalness: 0.3, roughness: 0.5 }),
  flashing: new THREE.MeshStandardMaterial({ color: 0xCC6E52, metalness: 0.3, roughness: 0.5, side: THREE.DoubleSide }),
  groundScrew: new THREE.MeshStandardMaterial({ color: 0xeeeeff, metalness: 0.6, roughness: 0.1 }),
  // pillar:  new THREE.MeshLambertMaterial({ color: COLOR }),
  // purlin:  new THREE.MeshLambertMaterial({ color: COLOR }),
  // rafter:  new THREE.MeshLambertMaterial({ color: COLOR }),
}

export interface RoofRenderOptions {
  lamberia?: boolean
  membrane?: boolean
  roofing?: boolean
  roofingModel?: RoofingModel
}

export function buildRoofMeshes(model: StructureModel, options?: RoofRenderOptions): THREE.Group {
  const group = new THREE.Group()

  for (const p of model.pillars)      { group.add(pillarMesh(p)); group.add(groundScrewMesh(p)) }
  for (const p of model.basePurlins)  group.add(purlinMesh(p))
  for (const tb of model.tieBeams)    group.add(tieBeamMesh(tb))
  for (const r of model.rafters)      group.add(rafterMesh(r, model.params.pitch))
  for (const rt of model.ridgeTies)   group.add(ridgeTieMesh(rt))
  for (const kb of model.kneeBraces)  group.add(kneeBraceMesh(kb))
  for (const kp of model.kingPosts)   group.add(pillarMesh(kp))
  group.add(purlinMesh(model.ridgePurlin))

  if (options?.lamberia) {
    const lamberiaMeshes = buildLamberiaMeshes(model)
    for (const m of lamberiaMeshes) group.add(m)
  }

  if (options?.membrane) {
    const membraneMeshes = buildMembraneMeshes(model, !!options.lamberia)
    for (const m of membraneMeshes) group.add(m)
    const cbMeshes = buildCounterBattenMeshes(model, !!options.lamberia)
    for (const m of cbMeshes) group.add(m)
    if (options.roofingModel?.dripEdge) {
      const dripMeshes = buildDripEdgeMeshes(model, options.roofingModel.dripEdge, !!options.lamberia)
      for (const m of dripMeshes) group.add(m)
    }
  }

  if (options?.roofing) {
    const rbMeshes = buildRoofBattenMeshes(model, !!options.lamberia, !!options.membrane)
    for (const m of rbMeshes) group.add(m)
    if (options.roofingModel?.metalSheets) {
      const sheetMeshes = buildMetalSheetMeshes(model, options.roofingModel.metalSheets, !!options.lamberia, !!options.membrane)
      for (const m of sheetMeshes) group.add(m)
    }
    if (options.roofingModel?.eavesFlashing) {
      const eavesMeshes = buildEavesFlashingMeshes(model, options.roofingModel.eavesFlashing, !!options.lamberia, !!options.membrane)
      for (const m of eavesMeshes) group.add(m)
    }
    if (options.roofingModel?.gableFlashing) {
      const gableMeshes = buildGableFlashingMeshes(model, options.roofingModel.gableFlashing, !!options.lamberia, !!options.membrane)
      for (const m of gableMeshes) group.add(m)
    }
    if (options.roofingModel?.ridgeFlashing) {
      const ridgeMeshes = buildRidgeFlashingMeshes(model, options.roofingModel.ridgeFlashing, !!options.lamberia, !!options.membrane)
      for (const m of ridgeMeshes) group.add(m)
    }
    if (options.roofingModel?.bugGuard) {
      const bugGuardMeshes = buildBugGuardMeshes(model, options.roofingModel.bugGuard, !!options.lamberia)
      for (const m of bugGuardMeshes) group.add(m)
    }
  }

  group.add(buildAnnotations(model))

  return group
}

export function disposeMaterials(): void {
  for (const mat of Object.values(MAT)) mat.dispose()
}

export function setMetalAppearance(color: number, roughness: number): void {
  const sheet = MAT.metalSheet as THREE.MeshStandardMaterial
  const flash = MAT.flashing as THREE.MeshStandardMaterial
  sheet.color.setHex(color)
  sheet.roughness = roughness
  flash.color.setHex(color)
  flash.roughness = roughness
}

const TIMBER_KEYS = ['pillar', 'purlin', 'rafter', 'lamberia'] as const
const TIMBER_LIGHTEN_STEP = 0.03

export function setTimberColor(color: number): void {
  const base = new THREE.Color(color)
  const hsl = { h: 0, s: 0, l: 0 }
  base.getHSL(hsl)
  for (let i = 0; i < TIMBER_KEYS.length; i++) {
    const c = new THREE.Color()
    c.setHSL(hsl.h, hsl.s, Math.min(1, hsl.l + (i%2) * TIMBER_LIGHTEN_STEP))
    ;(MAT[TIMBER_KEYS[i]] as THREE.MeshLambertMaterial).color.copy(c)
  }
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

// ── Ground screw (TALAJCSAVAR) ─────────────────────────────────────────────
// Box holder: 68mm wide × 135mm deep × (PILLAR_SIZE + 10mm) tall
// Cylinder: 70mm diameter, 500mm tall
// Cone: 70mm→20mm diameter, 500mm tall (underground)
const GS_BOX_WIDTH  = 0.09
const GS_BOX_DEPTH  = PILLAR_SIZE + 0.02
const GS_BOX_HEIGHT = 0.135
const GS_BOX_BELOW  = 0.005               // box bottom 5mm below pillar base
const GS_CYLINDER_D = 0.07
const GS_CYLINDER_H = 0.5
const GS_CONE_D_TOP = 0.07
const GS_CONE_D_BOT = 0.02
const GS_CONE_H     = 0.5

function groundScrewMesh(p: Pillar): THREE.Group {
  const group = new THREE.Group()
  const mat = MAT.groundScrew

  // Box holder — centered on pillar, bottom at pillar base - 5mm
  const boxGeo = new THREE.BoxGeometry(GS_BOX_DEPTH, GS_BOX_HEIGHT, GS_BOX_WIDTH)
  const box = new THREE.Mesh(boxGeo, mat)
  const boxBottomY = p.base.y - GS_BOX_BELOW
  box.position.set(p.base.x, boxBottomY + GS_BOX_HEIGHT / 2, p.base.z)
  box.castShadow = true
  group.add(box)

  // Cylinder — sits below box
  const cylGeo = new THREE.CylinderGeometry(GS_CYLINDER_D / 2, GS_CYLINDER_D / 2, GS_CYLINDER_H, 16)
  const cyl = new THREE.Mesh(cylGeo, mat)
  cyl.position.set(p.base.x, boxBottomY - GS_CYLINDER_H / 2, p.base.z)
  cyl.castShadow = true
  group.add(cyl)

  // Cone — tapers from 70mm to 20mm, below cylinder (underground)
  const coneGeo = new THREE.CylinderGeometry(GS_CONE_D_TOP / 2, GS_CONE_D_BOT / 2, GS_CONE_H, 16)
  const cone = new THREE.Mesh(coneGeo, mat)
  cone.position.set(p.base.x, boxBottomY - GS_CYLINDER_H - GS_CONE_H / 2, p.base.z)
  group.add(cone)

  return group
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

  const rw = r.width
  const rd = r.depth
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
  const dx = kb.end.x - kb.start.x, dy = kb.end.y - kb.start.y, dz = kb.end.z - kb.start.z
  const braceLen = Math.sqrt(dx * dx + dy * dy + dz * dz)
  const geo = new THREE.BoxGeometry(KNEE_BRACE_SIZE, KNEE_BRACE_SIZE, braceLen)
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
  const tanP = Math.sin(pitch)

  const refLeft = model.rafters[0]
  const rafterLen = refLeft.length
  const planksPerSlope = Math.ceil(rafterLen / LAMBERIA_WIDTH)
  const lastPlankWidth = rafterLen - (planksPerSlope - 1) * LAMBERIA_WIDTH + LAMBERIA_HEIGHT * tanP
  const halfLen = model.totalLength / 2

  // Taper insets (fixed gap size, independent of plank width)
  const TOP_INSET = 0.00
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
    const eaveY = refRafter.eaveEnd.y + refRafter.depth / (2 * cosP)

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

// ── Membrane ──────────────────────────────────────────────────────────────────

const MEMBRANE_THICKNESS = 0.001 // 1mm

/**
 * Builds membrane meshes for both slopes.
 *
 * A thin slab covering the entire slope surface. Sits on top of lamberia
 * if present, otherwise directly on the rafter top surface. The slope-length
 * is extended by height * tan(pitch) to account for the offset widening.
 *
 * @param hasLamberia Whether lamberia is present underneath
 */
function buildMembraneMeshes(model: StructureModel, hasLamberia: boolean): THREE.Mesh[] {
  const DEG = Math.PI / 180
  const pitch = model.params.pitch * DEG
  const cosP = Math.cos(pitch)
  const sinP = Math.sin(pitch)
  const tanP = Math.tan(pitch)

  const refLeft = model.rafters[0]
  const rafterLen = refLeft.length
  const halfLen = model.totalLength / 2

  // Height offset above rafter top surface (along slope normal)
  const baseOffset = hasLamberia ? LAMBERIA_HEIGHT : 0
  const totalOffset = baseOffset + MEMBRANE_THICKNESS

  // Slope extension from height offset: top of membrane is wider than rafter surface
  const slopeExtension = totalOffset * tanP

  const meshes: THREE.Mesh[] = []

  for (let side = 0; side < 2; side++) {
    const isLeft = side === 0
    const sign = isLeft ? 1 : -1

    const refRafter = isLeft ? refLeft : model.rafters.find(r => r.eaveEnd.z > 0)!
    const eaveZ = refRafter.eaveEnd.z
    const eaveY = refRafter.eaveEnd.y + refRafter.depth / (2 * cosP)

    // Bottom surface of membrane (= top of lamberia or rafter surface + baseOffset)
    const bnY = cosP * baseOffset  // normal offset Y component
    const bnZ = sinP * baseOffset  // normal offset Z magnitude

    // Top surface of membrane (baseOffset + MEMBRANE_THICKNESS)
    const tnY = cosP * totalOffset
    const tnZ = sinP * totalOffset

    // Eave end: start of slope (extended outward by slopeExtension)
    const slopeStart = -slopeExtension
    // Ridge end: end of slope (extended inward by slopeExtension)
    const slopeEnd = rafterLen + slopeExtension

    // Bottom-eave corner
    const bEaveZ = eaveZ + sign * slopeStart * cosP - sign * bnZ
    const bEaveY = eaveY + slopeStart * sinP + bnY
    // Bottom-ridge corner
    const bRidgeZ = eaveZ + sign * slopeEnd * cosP - sign * bnZ
    const bRidgeY = eaveY + slopeEnd * sinP + bnY

    // Top-eave corner
    const tEaveZ = eaveZ + sign * slopeStart * cosP - sign * tnZ
    const tEaveY = eaveY + slopeStart * sinP + tnY
    // Top-ridge corner
    const tRidgeZ = eaveZ + sign * slopeEnd * cosP - sign * tnZ
    const tRidgeY = eaveY + slopeEnd * sinP + tnY

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
      0, 5, 1,  0, 4, 5,   // bottom
      0, 1, 3,  0, 3, 2,   // left end (-x)
      4, 6, 7,  4, 7, 5,   // right end (+x)
      0, 2, 6,  0, 6, 4,   // eave edge
      1, 5, 7,  1, 7, 3,   // ridge edge
    ] : [
      2, 7, 3,  2, 6, 7,   // top (sky)
      0, 1, 5,  0, 5, 4,   // bottom
      0, 3, 1,  0, 2, 3,   // left end (-x)
      4, 7, 6,  4, 5, 7,   // right end (+x)
      0, 6, 2,  0, 4, 6,   // eave edge
      1, 7, 5,  1, 3, 7,   // ridge edge
    ]

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setIndex(tris)
    geo.computeVertexNormals()

    const mesh = new THREE.Mesh(geo, MAT.membrane)
    mesh.castShadow = true
    mesh.receiveShadow = true
    meshes.push(mesh)
  }

  return meshes
}

// ── Counter Battens ──────────────────────────────────────────────────────────

const COUNTER_BATTEN_SIZE = 0.05 // 5×5cm cross-section

/**
 * Builds counter batten meshes — one per rafter, centered above rafter centerline.
 *
 * Counter battens run along the slope direction, slightly longer than rafters
 * by COUNTER_BATTEN_SIZE * tan(pitch) + LAMBERIA_HEIGHT * tan(pitch) if lamberia
 * is present. BoxGeometry is used; ridge overlap is acceptable.
 *
 * @param hasLamberia Whether lamberia is present underneath
 */
function buildCounterBattenMeshes(model: StructureModel, hasLamberia: boolean): THREE.Mesh[] {
  const DEG = Math.PI / 180
  const pitch = model.params.pitch * DEG
  const cosP = Math.cos(pitch)
  const sinP = Math.sin(pitch)
  const tanP = Math.tan(pitch)

  const rafterLen = model.rafters[0].length
  const cbLength = rafterLen + COUNTER_BATTEN_SIZE * tanP + (hasLamberia ? LAMBERIA_HEIGHT * tanP : 0)

  // Normal distance from rafter top surface to counter batten center
  const normalDist = (hasLamberia ? LAMBERIA_HEIGHT : 0) + MEMBRANE_THICKNESS + COUNTER_BATTEN_SIZE / 2

  const meshes: THREE.Mesh[] = []

  for (const rafter of model.rafters) {
    const isLeft = rafter.eaveEnd.z < 0
    const sign = isLeft ? 1 : -1

    // Rafter top surface Y at eave
    const eaveTopY = rafter.eaveEnd.y + rafter.depth / (2 * cosP)
    const eaveZ = rafter.eaveEnd.z

    // Counter batten center along slope (from eave end)
    const slopeCenter = cbLength / 2

    // Center position: move along slope from eave + offset by normal
    const cx = rafter.eaveEnd.x
    const cy = eaveTopY + slopeCenter * sinP + normalDist * cosP
    const cz = eaveZ + sign * slopeCenter * cosP - sign * normalDist * sinP

    const geo = new THREE.BoxGeometry(COUNTER_BATTEN_SIZE, COUNTER_BATTEN_SIZE, cbLength)
    const mesh = new THREE.Mesh(geo, MAT.counterBatten)
    mesh.position.set(cx, cy, cz)

    // Orient box local Z along slope direction
    // Use consistent right-handed basis: for right slope, flip slopeDir
    // instead of negating normal (negating breaks handedness → degenerate quaternion)
    const zDir = new THREE.Vector3(0, sinP, sign * cosP)
    const xDir = new THREE.Vector3(1, 0, 0)
    const yDir = new THREE.Vector3().crossVectors(zDir, xDir)
    if (yDir.y < 0) { yDir.negate(); zDir.negate() }
    const basis = new THREE.Matrix4().makeBasis(xDir, yDir, zDir)
    mesh.quaternion.setFromRotationMatrix(basis)

    mesh.castShadow = true
    mesh.receiveShadow = true
    meshes.push(mesh)
  }

  return meshes
}

// ── Roof Battens ─────────────────────────────────────────────────────────────

const ROOF_BATTEN_HEIGHT = 0.03 // 3cm perpendicular to slope
const ROOF_BATTEN_WIDTH = 0.05  // 5cm along slope direction

/**
 * Builds roof batten meshes — horizontal rows running along X (totalLength),
 * evenly spaced along the slope on both sides.
 *
 * Spacing is derived like rafter spacing: bays = ceil(span / maxSpacing),
 * then actual spacing = span / bays. First batten's lower edge at eave,
 * last batten's upper edge at ridge.
 *
 * @param hasLamberia Whether lamberia is present underneath
 */
function buildRoofBattenMeshes(model: StructureModel, hasLamberia: boolean, hasMembrane: boolean): THREE.Mesh[] {
  const DEG = Math.PI / 180
  const pitch = model.params.pitch * DEG
  const cosP = Math.cos(pitch)
  const sinP = Math.sin(pitch)
  const tanP = Math.tan(pitch)

  const rafterLen = model.rafters[0].length
  const layerOffset = (hasLamberia ? LAMBERIA_HEIGHT : 0) + (hasMembrane ? MEMBRANE_THICKNESS + COUNTER_BATTEN_SIZE : 0)
  const slopeSpan = rafterLen + layerOffset * tanP

  // Even spacing like rafterSpacing(): first lower edge at eave, last upper edge at ridge
  const innerSpan = slopeSpan - ROOF_BATTEN_WIDTH
  const bays = Math.ceil(innerSpan / ROOF_BATTEN_DISTANCE)
  const spacing = innerSpan / bays
  const numBattens = bays + 1

  // Normal distance from rafter top to batten center
  const normalDist = layerOffset + ROOF_BATTEN_HEIGHT / 2

  const totalLength = model.totalLength
  const meshes: THREE.Mesh[] = []

  for (let side = 0; side < 2; side++) {
    const isLeft = side === 0
    const sign = isLeft ? 1 : -1

    const refRafter = isLeft ? model.rafters[0] : model.rafters.find(r => r.eaveEnd.z > 0)!
    const eaveTopY = refRafter.eaveEnd.y + refRafter.depth / (2 * cosP)
    const eaveZ = refRafter.eaveEnd.z

    // Compute orientation once per slope (same basis as counter battens)
    const zDir = new THREE.Vector3(0, sinP, sign * cosP)
    const xDir = new THREE.Vector3(1, 0, 0)
    const yDir = new THREE.Vector3().crossVectors(zDir, xDir)
    if (yDir.y < 0) { yDir.negate(); zDir.negate() }
    const basis = new THREE.Matrix4().makeBasis(xDir, yDir, zDir)
    const quat = new THREE.Quaternion().setFromRotationMatrix(basis)

    for (let i = 0; i < numBattens; i++) {
      // Center of batten i along slope, measured from eave
      const slopePos = ROOF_BATTEN_WIDTH / 2 + i * spacing

      const cy = eaveTopY + slopePos * sinP + normalDist * cosP
      const cz = eaveZ + sign * slopePos * cosP - sign * normalDist * sinP

      const geo = new THREE.BoxGeometry(totalLength, ROOF_BATTEN_HEIGHT, ROOF_BATTEN_WIDTH)
      const mesh = new THREE.Mesh(geo, MAT.counterBatten) // same turquoise
      mesh.position.set(0, cy, cz)
      mesh.quaternion.copy(quat)

      mesh.castShadow = true
      mesh.receiveShadow = true
      meshes.push(mesh)
    }
  }

  return meshes
}

// ── Metal Sheets ─────────────────────────────────────────────────────────────

/**
 * Builds metal sheet and álló korc meshes for both slopes.
 *
 * Each sheet is a thin slab (SHEET_THICKNESS) positioned from the MetalSheets
 * model. Álló korcs are small boxes (KORC_WIDTH × KORC_HEIGHT) at each sheet
 * junction, running the full slope length.
 */
function buildMetalSheetMeshes(
  model: StructureModel,
  metalSheets: import('../model/roofing').MetalSheets,
  hasLamberia: boolean,
  hasMembrane: boolean,
): THREE.Mesh[] {
  const DEG = Math.PI / 180
  const pitch = model.params.pitch * DEG
  const cosP = Math.cos(pitch)
  const sinP = Math.sin(pitch)

  const slopeLength = metalSheets.slopeLength

  // Normal distance from rafter top to sheet/korc center
  const layerOffset = (hasLamberia ? LAMBERIA_HEIGHT : 0)
    + (hasMembrane ? MEMBRANE_THICKNESS + COUNTER_BATTEN_SIZE : 0)
    + ROOF_BATTEN_HEIGHT
  const sheetNormalDist = layerOffset + SHEET_THICKNESS / 2
  const korcNormalDist = layerOffset + KORC_HEIGHT / 2

  // Shift sheets down slope for eaves flashing overlap
  const slopeCenter = slopeLength / 2 - metalSheets.eavesOverlap
  const meshes: THREE.Mesh[] = []

  for (let side = 0; side < 2; side++) {
    const isLeft = side === 0
    const sign = isLeft ? 1 : -1

    const refRafter = isLeft ? model.rafters[0] : model.rafters.find(r => r.eaveEnd.z > 0)!
    const eaveTopY = refRafter.eaveEnd.y + refRafter.depth / (2 * cosP)
    const eaveZ = refRafter.eaveEnd.z

    // Slope orientation (same basis as battens)
    const zDir = new THREE.Vector3(0, sinP, sign * cosP)
    const xDir = new THREE.Vector3(1, 0, 0)
    const yDir = new THREE.Vector3().crossVectors(zDir, xDir)
    if (yDir.y < 0) { yDir.negate(); zDir.negate() }
    const basis = new THREE.Matrix4().makeBasis(xDir, yDir, zDir)
    const quat = new THREE.Quaternion().setFromRotationMatrix(basis)

    // Sheet center in YZ (slope midpoint + normal offset)
    const sheetCY = eaveTopY + slopeCenter * sinP + sheetNormalDist * cosP
    const sheetCZ = eaveZ + sign * slopeCenter * cosP - sign * sheetNormalDist * sinP

    for (const sheet of metalSheets.sheets) {
      const geo = new THREE.BoxGeometry(sheet.width, SHEET_THICKNESS, slopeLength)
      const mesh = new THREE.Mesh(geo, MAT.metalSheet)
      mesh.position.set(sheet.x, sheetCY, sheetCZ)
      mesh.quaternion.copy(quat)
      mesh.castShadow = true
      mesh.receiveShadow = true
      meshes.push(mesh)
    }

    // Álló korcs at sheet junctions
    const korcCY = eaveTopY + slopeCenter * sinP + korcNormalDist * cosP
    const korcCZ = eaveZ + sign * slopeCenter * cosP - sign * korcNormalDist * sinP

    for (const korcX of metalSheets.korcXPositions) {
      const geo = new THREE.BoxGeometry(KORC_WIDTH, KORC_HEIGHT, slopeLength)
      const mesh = new THREE.Mesh(geo, MAT.metalSheet)
      mesh.position.set(korcX, korcCY, korcCZ)
      mesh.quaternion.copy(quat)
      mesh.castShadow = true
      mesh.receiveShadow = true
      meshes.push(mesh)
    }
  }

  return meshes
}

// ── Drip Edge ──────────────────────────────────────────────────────────────────

/**
 * Builds drip edge meshes for both slopes at the eaves.
 *
 * Each drip edge consists of two planes:
 * 1. Flat part: DRIP_EDGE_FLAT_WIDTH (9cm) along slope, sitting on rafter/lamberia surface
 * 2. Visor: DRIP_EDGE_VISOR_WIDTH (2.5cm), angled DRIP_EDGE_VISOR_ANGLE (15°) from vertical,
 *    leaning outward from the building
 *
 * Both planes run the full dripEdge.length along X. Each plane is a thin slab
 * (DRIP_EDGE_THICKNESS) rendered with 8 vertices.
 */
function buildDripEdgeMeshes(
  model: StructureModel,
  dripEdge: import('../model/roofing').DripEdgeModel,
  hasLamberia: boolean,
): THREE.Mesh[] {
  const DEG = Math.PI / 180
  const pitch = model.params.pitch * DEG
  const cosP = Math.cos(pitch)
  const sinP = Math.sin(pitch)

  const halfLen = dripEdge.length / 2

  // Normal offset from rafter top surface (lamberia if present)
  const normalOffset = hasLamberia ? LAMBERIA_HEIGHT : 0

  // Visor angle from vertical in world space: the visor leans outward.
  // The visor starts where the flat part's eave edge is, and goes downward
  // at (90° - DRIP_EDGE_VISOR_ANGLE) from slope surface = visorAngle from vertical.
  const visorAngle = DRIP_EDGE_VISOR_ANGLE * DEG

  const meshes: THREE.Mesh[] = []

  for (let side = 0; side < 2; side++) {
    const isLeft = side === 0
    const sign = isLeft ? 1 : -1

    const refRafter = isLeft ? model.rafters[0] : model.rafters.find(r => r.eaveEnd.z > 0)!
    const eaveTopY = refRafter.eaveEnd.y + refRafter.depth / (2 * cosP)
    const eaveZ = refRafter.eaveEnd.z

    // ── Flat part ─────────────────────────────────────────────────────────
    // Bottom surface sits on rafter/lamberia top. Runs from eave edge inward
    // (toward ridge) for DRIP_EDGE_FLAT_WIDTH along slope.

    // Eave edge (outer, slope distance = -0.01, shifted 1cm down slope for visual fit)
    // Small Y offset to avoid z-fighting with membrane/lamberia surface
    const slopeShift = -0.01
    const flatBotEaveY = eaveTopY + normalOffset * cosP - 0.001 + slopeShift * sinP
    const flatBotEaveZ = eaveZ - sign * normalOffset * sinP + sign * slopeShift * cosP

    // Ridge edge of flat part (slope distance = DRIP_EDGE_FLAT_WIDTH inward)
    const flatBotRidgeY = flatBotEaveY + DRIP_EDGE_FLAT_WIDTH * sinP
    const flatBotRidgeZ = flatBotEaveZ + sign * DRIP_EDGE_FLAT_WIDTH * cosP

    // Top surface = bottom + thickness along normal
    const tOffY = DRIP_EDGE_THICKNESS * cosP
    const tOffZ = DRIP_EDGE_THICKNESS * sinP

    const flatTopEaveY = flatBotEaveY + tOffY
    const flatTopEaveZ = flatBotEaveZ - sign * tOffZ
    const flatTopRidgeY = flatBotRidgeY + tOffY
    const flatTopRidgeZ = flatBotRidgeZ - sign * tOffZ

    const flatPos = new Float32Array([
      -halfLen, flatBotEaveY,  flatBotEaveZ,   // 0 bot-eave-left
      -halfLen, flatBotRidgeY, flatBotRidgeZ,  // 1 bot-ridge-left
      -halfLen, flatTopEaveY,  flatTopEaveZ,   // 2 top-eave-left
      -halfLen, flatTopRidgeY, flatTopRidgeZ,  // 3 top-ridge-left
      +halfLen, flatBotEaveY,  flatBotEaveZ,   // 4 bot-eave-right
      +halfLen, flatBotRidgeY, flatBotRidgeZ,  // 5 bot-ridge-right
      +halfLen, flatTopEaveY,  flatTopEaveZ,   // 6 top-eave-right
      +halfLen, flatTopRidgeY, flatTopRidgeZ,  // 7 top-ridge-right
    ])

    const flatTris = isLeft ? [
      2, 3, 7,  2, 7, 6,   // top (sky)
      0, 5, 1,  0, 4, 5,   // bottom (rafter)
      0, 1, 3,  0, 3, 2,   // left end (-x)
      4, 6, 7,  4, 7, 5,   // right end (+x)
      0, 2, 6,  0, 6, 4,   // eave edge
      1, 5, 7,  1, 7, 3,   // ridge edge
    ] : [
      2, 7, 3,  2, 6, 7,
      0, 1, 5,  0, 5, 4,
      0, 3, 1,  0, 2, 3,
      4, 7, 6,  4, 5, 7,
      0, 6, 2,  0, 4, 6,
      1, 7, 5,  1, 3, 7,
    ]

    const flatGeo = new THREE.BufferGeometry()
    flatGeo.setAttribute('position', new THREE.BufferAttribute(flatPos, 3))
    flatGeo.setIndex(flatTris)
    flatGeo.computeVertexNormals()
    const flatMesh = new THREE.Mesh(flatGeo, MAT.flashing)
    flatMesh.castShadow = true
    flatMesh.receiveShadow = true
    meshes.push(flatMesh)

    // ── Visor part ────────────────────────────────────────────────────────
    // Starts at the eave edge of the flat part (top surface), goes downward
    // at visorAngle from vertical, leaning outward (away from building).
    //
    // Visor direction in YZ: downward and outward.
    // "Outward" for left slope (z<0) = toward -z; for right slope = toward +z.
    // Angle from vertical = visorAngle, so:
    //   dy = -DRIP_EDGE_VISOR_WIDTH * cos(visorAngle)  (downward)
    //   dz = -sign * DRIP_EDGE_VISOR_WIDTH * sin(visorAngle)  (outward)
    const visorDY = -DRIP_EDGE_VISOR_WIDTH * Math.cos(visorAngle)
    const visorDZ = -sign * DRIP_EDGE_VISOR_WIDTH * Math.sin(visorAngle)

    // Visor top edge = flat part's eave edge (top surface)
    const visorTopY = flatTopEaveY
    const visorTopZ = flatTopEaveZ

    // Visor bottom edge
    const visorBotY = visorTopY + visorDY
    const visorBotZ = visorTopZ + visorDZ

    // Thickness offset perpendicular to visor surface
    // Visor surface normal: rotate visor direction 90° (toward building interior)
    // visor dir = (visorDY, visorDZ), normalized, then rotate 90° CW in YZ
    const vLen = DRIP_EDGE_VISOR_WIDTH
    const vnY = visorDZ / vLen   // rotated 90° CW: (dy,dz) → (dz, -dy)
    const vnZ = -visorDY / vLen
    const vtOffY = DRIP_EDGE_THICKNESS * vnY
    const vtOffZ = DRIP_EDGE_THICKNESS * vnZ

    const visorPos = new Float32Array([
      -halfLen, visorTopY,           visorTopZ,            // 0 outer-top-left
      -halfLen, visorBotY,           visorBotZ,            // 1 outer-bot-left
      -halfLen, visorTopY + vtOffY,  visorTopZ + vtOffZ,   // 2 inner-top-left
      -halfLen, visorBotY + vtOffY,  visorBotZ + vtOffZ,   // 3 inner-bot-left
      +halfLen, visorTopY,           visorTopZ,            // 4 outer-top-right
      +halfLen, visorBotY,           visorBotZ,            // 5 outer-bot-right
      +halfLen, visorTopY + vtOffY,  visorTopZ + vtOffZ,   // 6 inner-top-right
      +halfLen, visorBotY + vtOffY,  visorBotZ + vtOffZ,   // 7 inner-bot-right
    ])

    // Faces: outer, inner, top edge, bottom edge, left end, right end
    const visorTris = isLeft ? [
      0, 1, 5,  0, 5, 4,   // outer face
      2, 6, 7,  2, 7, 3,   // inner face
      0, 4, 6,  0, 6, 2,   // top edge
      1, 3, 7,  1, 7, 5,   // bottom edge
      0, 2, 3,  0, 3, 1,   // left end (-x)
      4, 5, 7,  4, 7, 6,   // right end (+x)
    ] : [
      0, 5, 1,  0, 4, 5,   // outer face
      2, 7, 6,  2, 3, 7,   // inner face
      0, 6, 4,  0, 2, 6,   // top edge
      1, 7, 3,  1, 5, 7,   // bottom edge
      0, 3, 2,  0, 1, 3,   // left end (-x)
      4, 7, 5,  4, 6, 7,   // right end (+x)
    ]

    const visorGeo = new THREE.BufferGeometry()
    visorGeo.setAttribute('position', new THREE.BufferAttribute(visorPos, 3))
    visorGeo.setIndex(visorTris)
    visorGeo.computeVertexNormals()
    const visorMesh = new THREE.Mesh(visorGeo, MAT.flashing)
    visorMesh.castShadow = true
    visorMesh.receiveShadow = true
    meshes.push(visorMesh)
  }

  return meshes
}

// ── Eaves Flashing ─────────────────────────────────────────────────────────────

/**
 * Builds eaves flashing meshes for both slopes.
 *
 * A visor-only flashing that starts from the top outer edge of the first
 * roof batten (at the eave) and hangs downward at EAVES_FLASHING_ANGLE
 * from vertical, leaning outward.
 */
function buildEavesFlashingMeshes(
  model: StructureModel,
  eavesFlashing: import('../model/roofing').EavesFlashingModel,
  hasLamberia: boolean,
  hasMembrane: boolean,
): THREE.Mesh[] {
  const DEG = Math.PI / 180
  const pitch = model.params.pitch * DEG
  const cosP = Math.cos(pitch)
  const sinP = Math.sin(pitch)

  const halfLen = eavesFlashing.length / 2

  // Layer offset from rafter top to top of roof batten (same as in buildRoofBattenMeshes)
  const layerOffset = (hasLamberia ? LAMBERIA_HEIGHT : 0)
    + (hasMembrane ? MEMBRANE_THICKNESS + COUNTER_BATTEN_SIZE : 0)
    + ROOF_BATTEN_HEIGHT

  const visorAngle = EAVES_FLASHING_ANGLE * DEG

  const meshes: THREE.Mesh[] = []

  for (let side = 0; side < 2; side++) {
    const isLeft = side === 0
    const sign = isLeft ? 1 : -1

    const refRafter = isLeft ? model.rafters[0] : model.rafters.find(r => r.eaveEnd.z > 0)!
    const eaveTopY = refRafter.eaveEnd.y + refRafter.depth / (2 * cosP)
    const eaveZ = refRafter.eaveEnd.z

    // Top outer edge of the first roof batten = eave position + layerOffset along normal
    // The first batten's lower edge is at the eave (slopePos = 0), so its outer
    // (eave-side) top edge is at slopePos = 0, normal offset = layerOffset
    const startY = eaveTopY + layerOffset * cosP
    const startZ = eaveZ - sign * layerOffset * sinP

    // Visor direction: downward and outward at visorAngle from vertical
    const visorDY = -EAVES_FLASHING_VISOR_WIDTH * Math.cos(visorAngle)
    const visorDZ = -sign * EAVES_FLASHING_VISOR_WIDTH * Math.sin(visorAngle)

    const endY = startY + visorDY
    const endZ = startZ + visorDZ

    // Thickness offset perpendicular to visor surface (toward building interior)
    const vLen = EAVES_FLASHING_VISOR_WIDTH
    const vnY = visorDZ / vLen
    const vnZ = -visorDY / vLen
    const tOffY = EAVES_FLASHING_THICKNESS * vnY
    const tOffZ = EAVES_FLASHING_THICKNESS * vnZ

    const pos = new Float32Array([
      -halfLen, startY,          startZ,          // 0 outer-top-left
      -halfLen, endY,            endZ,            // 1 outer-bot-left
      -halfLen, startY + tOffY,  startZ + tOffZ,  // 2 inner-top-left
      -halfLen, endY + tOffY,    endZ + tOffZ,    // 3 inner-bot-left
      +halfLen, startY,          startZ,          // 4 outer-top-right
      +halfLen, endY,            endZ,            // 5 outer-bot-right
      +halfLen, startY + tOffY,  startZ + tOffZ,  // 6 inner-top-right
      +halfLen, endY + tOffY,    endZ + tOffZ,    // 7 inner-bot-right
    ])

    const tris = isLeft ? [
      0, 1, 5,  0, 5, 4,   // outer face
      2, 6, 7,  2, 7, 3,   // inner face
      0, 4, 6,  0, 6, 2,   // top edge
      1, 3, 7,  1, 7, 5,   // bottom edge
      0, 2, 3,  0, 3, 1,   // left end (-x)
      4, 5, 7,  4, 7, 6,   // right end (+x)
    ] : [
      0, 5, 1,  0, 4, 5,
      2, 7, 6,  2, 3, 7,
      0, 6, 4,  0, 2, 6,
      1, 7, 3,  1, 5, 7,
      0, 3, 2,  0, 1, 3,
      4, 7, 5,  4, 6, 7,
    ]

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setIndex(tris)
    geo.computeVertexNormals()
    const mesh = new THREE.Mesh(geo, MAT.flashing)
    mesh.castShadow = true
    mesh.receiveShadow = true
    meshes.push(mesh)
  }

  return meshes
}

// ── Gable Flashing ─────────────────────────────────────────────────────────────

/**
 * Builds gable flashing meshes — two elements per gable end per slope:
 *
 * 1. Vertical skirt: 1mm thick, 142mm tall, spanning eave to ridge along slope.
 *    Positioned at x = ±(halfLength + 0.001) to avoid z-fighting with rafters.
 *
 * 2. Top cap: 2.5cm high (perpendicular to slope), 5cm wide (along X),
 *    running eave to ridge on top of the metal sheet stack.
 *    Slope length includes stacking extension so the two caps meet at the ridge.
 */
function buildGableFlashingMeshes(
  model: StructureModel,
  gableFlashing: import('../model/roofing').GableFlashingModel,
  hasLamberia: boolean,
  hasMembrane: boolean,
): THREE.Mesh[] {
  const DEG = Math.PI / 180
  const pitch = model.params.pitch * DEG
  const cosP = Math.cos(pitch)
  const sinP = Math.sin(pitch)
  const tanP = Math.tan(pitch)

  const rafterLen = model.rafters[0].length
  const halfLength = gableFlashing.halfLength
  const overhang = gableFlashing.overhang
  const eavesOverlap = gableFlashing.eavesOverlap

  // Layer offset from rafter top to top of metal sheet
  const layerOffset = (hasLamberia ? LAMBERIA_HEIGHT : 0)
    + (hasMembrane ? MEMBRANE_THICKNESS + COUNTER_BATTEN_SIZE : 0)
    + ROOF_BATTEN_HEIGHT
    + SHEET_THICKNESS

  // Skirt: top edge at cap top, hanging down GABLE_FLASHING_SKIRT_HEIGHT
  const skirtTopNormal = layerOffset + GABLE_FLASHING_CAP_HEIGHT
  const skirtSlopeLen = rafterLen + skirtTopNormal * tanP + eavesOverlap

  // Cap: sits on top of metal sheets, slope length extended so caps meet at ridge
  const capCenterNormal = layerOffset + GABLE_FLASHING_CAP_HEIGHT / 2
  const capTopNormal = layerOffset + GABLE_FLASHING_CAP_HEIGHT
  const capSlopeLen = rafterLen + capTopNormal * tanP + eavesOverlap

  const meshes: THREE.Mesh[] = []

  for (let gableEnd = 0; gableEnd < 2; gableEnd++) {
    // gableEnd 0 = left (-x), gableEnd 1 = right (+x)
    const gableX = gableEnd === 0
      ? -(halfLength + overhang)
      : +(halfLength + overhang)

    for (let side = 0; side < 2; side++) {
      const isLeft = side === 0
      const sign = isLeft ? 1 : -1

      const refRafter = isLeft ? model.rafters[0] : model.rafters.find(r => r.eaveEnd.z > 0)!
      const eaveTopY = refRafter.eaveEnd.y + refRafter.depth / (2 * cosP)
      const eaveZ = refRafter.eaveEnd.z

      // Slope orientation
      const zDir = new THREE.Vector3(0, sinP, sign * cosP)
      const xDir = new THREE.Vector3(1, 0, 0)
      const yDir = new THREE.Vector3().crossVectors(zDir, xDir)
      if (yDir.y < 0) { yDir.negate(); zDir.negate() }
      const basis = new THREE.Matrix4().makeBasis(xDir, yDir, zDir)
      const quat = new THREE.Quaternion().setFromRotationMatrix(basis)

      // ── Skirt (vertical plane) ──────────────────────────────────────────
      // Center along slope, shifted down by eavesOverlap
      const skirtCenter = skirtSlopeLen / 2 - eavesOverlap
      const skirtNormalDist = skirtTopNormal - GABLE_FLASHING_SKIRT_HEIGHT / 2
      const skirtCY = eaveTopY + skirtCenter * sinP + skirtNormalDist * cosP
      const skirtCZ = eaveZ + sign * skirtCenter * cosP - sign * skirtNormalDist * sinP

      const skirtGeo = new THREE.BoxGeometry(
        GABLE_FLASHING_SKIRT_THICKNESS,  // X: 1mm thick
        GABLE_FLASHING_SKIRT_HEIGHT,     // Y: 142mm perpendicular to slope
        skirtSlopeLen,                    // Z: eave to ridge
      )
      const skirtMesh = new THREE.Mesh(skirtGeo, MAT.flashing)
      skirtMesh.position.set(gableX, skirtCY, skirtCZ)
      skirtMesh.quaternion.copy(quat)
      skirtMesh.castShadow = true
      skirtMesh.receiveShadow = true
      meshes.push(skirtMesh)

      // ── Skirt drip visor (trapezoid prism) ─────────────────────────────
      // 1.5cm visor at skirt bottom edge, angled from slope-normal, leaning outward.
      // The outer edge sits lower by VISOR_WIDTH * cos(VISOR_ANGLE) in the
      // slope-normal direction, so at the ridge it must be shorter by that
      // amount × tan(pitch). This makes it a trapezoid prism, not a box.
      {
        const visorAngle = GABLE_FLASHING_VISOR_ANGLE * DEG
        const skirtBotNormal = skirtTopNormal - GABLE_FLASHING_SKIRT_HEIGHT
        const outwardX = gableEnd === 0 ? -1 : 1

        // Inner edge (attached to skirt bottom) slope length
        const innerSlopeLen = skirtSlopeLen - GABLE_FLASHING_SKIRT_HEIGHT * tanP
        // Outer edge is shorter at ridge by the normal drop × tan(pitch)
        const normalDrop = GABLE_FLASHING_VISOR_WIDTH * Math.cos(visorAngle)
        const outerSlopeLen = innerSlopeLen - normalDrop * tanP

        // Visor basis: X=visorDir (inner→outer), Y=visorNorm, Z=slopeZ (eave→ridge)
        const visorDirX = outwardX * Math.sin(visorAngle)
        const visorNormalComponent = -Math.cos(visorAngle)
        const visorDirY = visorNormalComponent * cosP
        const visorDirZ = -visorNormalComponent * sinP * sign

        const visorDir = new THREE.Vector3(visorDirX, visorDirY, visorDirZ).normalize()
        const slopeZ = new THREE.Vector3(0, sinP, sign * cosP)
        if (slopeZ.dot(new THREE.Vector3(0, 1, 0)) < 0) slopeZ.negate()
        const visorNorm = new THREE.Vector3().crossVectors(slopeZ, visorDir).normalize()

        // Position: inner edge center (skirt bottom, midway along inner slope length)
        const innerCenter = innerSlopeLen / 2 - eavesOverlap
        const innerCY = eaveTopY + innerCenter * sinP + skirtBotNormal * cosP
        const innerCZ = eaveZ + sign * innerCenter * cosP - sign * skirtBotNormal * sinP

        // Build trapezoid prism in world coords from the inner edge center
        // Local axes: X=visorDir, Y=visorNorm, Z=slopeZ
        const W = GABLE_FLASHING_VISOR_WIDTH
        const T = GABLE_FLASHING_SKIRT_THICKNESS
        const iHL = innerSlopeLen / 2  // inner half-length
        // Both edges share the same eave end (Z = -iHL) but differ at ridge end
        const eaveZ2 = -iHL  // same for inner and outer
        const innerRidgeZ = +iHL
        const outerRidgeZ = +iHL - (innerSlopeLen - outerSlopeLen)  // = iHL - normalDrop*tanP

        // 8 vertices in local coords (X=visor dir, Y=thickness, Z=slope)
        const verts = new Float32Array([
          // inner edge (X=0), bottom/top, eave/ridge
          0,   -T/2, eaveZ2,        // v0: inner, bottom, eave
          0,   -T/2, innerRidgeZ,   // v1: inner, bottom, ridge
          0,   +T/2, eaveZ2,        // v2: inner, top, eave
          0,   +T/2, innerRidgeZ,   // v3: inner, top, ridge
          // outer edge (X=W), bottom/top, eave/ridge
          W,   -T/2, eaveZ2,        // v4: outer, bottom, eave
          W,   -T/2, outerRidgeZ,   // v5: outer, bottom, ridge
          W,   +T/2, eaveZ2,        // v6: outer, top, eave
          W,   +T/2, outerRidgeZ,   // v7: outer, top, ridge
        ])

        // Transform local vertices to world coords
        const positions = new Float32Array(24)
        for (let vi = 0; vi < 8; vi++) {
          const lx = verts[vi * 3 + 0]
          const ly = verts[vi * 3 + 1]
          const lz = verts[vi * 3 + 2]
          // world = innerEdgeCenter + lx * visorDir + ly * visorNorm + lz * slopeZ
          positions[vi * 3 + 0] = gableX + lx * visorDir.x + ly * visorNorm.x + lz * slopeZ.x
          positions[vi * 3 + 1] = innerCY + lx * visorDir.y + ly * visorNorm.y + lz * slopeZ.y
          positions[vi * 3 + 2] = innerCZ + lx * visorDir.z + ly * visorNorm.z + lz * slopeZ.z
        }

        // 12 triangles (6 faces × 2 tris)
        const indices = [
          // bottom face (-Y): v0, v4, v5, v1
          0, 4, 5,  0, 5, 1,
          // top face (+Y): v2, v3, v7, v6
          2, 3, 7,  2, 7, 6,
          // inner face (-X): v0, v1, v3, v2
          0, 1, 3,  0, 3, 2,
          // outer face (+X): v4, v6, v7, v5
          4, 6, 7,  4, 7, 5,
          // eave face (-Z): v0, v2, v6, v4
          0, 2, 6,  0, 6, 4,
          // ridge face (+Z): v1, v5, v7, v3
          1, 5, 7,  1, 7, 3,
        ]

        const visorGeo = new THREE.BufferGeometry()
        visorGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
        visorGeo.setIndex(indices)
        visorGeo.computeVertexNormals()

        const visorMesh = new THREE.Mesh(visorGeo, MAT.flashing)
        visorMesh.castShadow = true
        visorMesh.receiveShadow = true
        meshes.push(visorMesh)
      }

      // ── Top cap ─────────────────────────────────────────────────────────
      const capCenter = capSlopeLen / 2 - eavesOverlap
      const capCY = eaveTopY + capCenter * sinP + capCenterNormal * cosP
      const capCZ = eaveZ + sign * capCenter * cosP - sign * capCenterNormal * sinP

      // Cap X position: outer face flush with skirt
      const inwardSign = gableEnd === 0 ? 1 : -1
      const capX = gableX + inwardSign * GABLE_FLASHING_CAP_WIDTH / 2

      const capGeo = new THREE.BoxGeometry(
        GABLE_FLASHING_CAP_WIDTH,   // X: 5cm wide
        GABLE_FLASHING_CAP_HEIGHT,  // Y: 2.5cm perpendicular to slope
        capSlopeLen,                // Z: eave to ridge (extended for stacking)
      )
      const capMesh = new THREE.Mesh(capGeo, MAT.flashing)
      capMesh.position.set(capX, capCY, capCZ)
      capMesh.quaternion.copy(quat)
      capMesh.castShadow = true
      capMesh.receiveShadow = true
      meshes.push(capMesh)
    }
  }

  return meshes
}

// ── Ridge Flashing ──────────────────────────────────────────────────────────────

/**
 * Builds ridge flashing meshes — one thin plane per slope, 205mm wide,
 * sitting 5cm above the metal sheets (along slope normal), meeting at the ridge.
 */
function buildRidgeFlashingMeshes(
  model: StructureModel,
  ridgeFlashing: import('../model/roofing').RidgeFlashingModel,
  hasLamberia: boolean,
  hasMembrane: boolean,
): THREE.Mesh[] {
  const DEG = Math.PI / 180
  const pitch = model.params.pitch * DEG
  const cosP = Math.cos(pitch)
  const sinP = Math.sin(pitch)
  const tanP = Math.tan(pitch)

  const rafterLen = model.rafters[0].length

  // Normal distance from rafter top to ridge flashing surface
  const layerOffset = (hasLamberia ? LAMBERIA_HEIGHT : 0)
    + (hasMembrane ? MEMBRANE_THICKNESS + COUNTER_BATTEN_SIZE : 0)
    + ROOF_BATTEN_HEIGHT
    + SHEET_THICKNESS
  const normalDist = layerOffset + RIDGE_FLASHING_GAP + RIDGE_FLASHING_THICKNESS / 2

  // The flashing's ridge edge must account for stacking:
  // at normalDist from rafter, the ridge meeting point extends by normalDist * tanP
  const ridgeExtension = normalDist * tanP

  const meshes: THREE.Mesh[] = []

  for (let side = 0; side < 2; side++) {
    const isLeft = side === 0
    const sign = isLeft ? 1 : -1

    const refRafter = isLeft ? model.rafters[0] : model.rafters.find(r => r.eaveEnd.z > 0)!
    const eaveTopY = refRafter.eaveEnd.y + refRafter.depth / (2 * cosP)
    const eaveZ = refRafter.eaveEnd.z

    // Slope orientation
    const zDir = new THREE.Vector3(0, sinP, sign * cosP)
    const xDir = new THREE.Vector3(1, 0, 0)
    const yDir = new THREE.Vector3().crossVectors(zDir, xDir)
    if (yDir.y < 0) { yDir.negate(); zDir.negate() }
    const basis = new THREE.Matrix4().makeBasis(xDir, yDir, zDir)
    const quat = new THREE.Quaternion().setFromRotationMatrix(basis)

    // Center of flashing strip along slope:
    // Ridge edge is at (rafterLen + ridgeExtension), eave edge is RIDGE_FLASHING_WIDTH below
    const ridgeEdgeSlope = rafterLen + ridgeExtension
    const centerSlope = ridgeEdgeSlope - RIDGE_FLASHING_WIDTH / 2

    const cY = eaveTopY + centerSlope * sinP + normalDist * cosP
    const cZ = eaveZ + sign * centerSlope * cosP - sign * normalDist * sinP

    const geo = new THREE.BoxGeometry(
      ridgeFlashing.length,       // X: full totalLength
      RIDGE_FLASHING_THICKNESS,   // Y: 0.5mm thick
      RIDGE_FLASHING_WIDTH,       // Z: 205mm across slope
    )
    const mesh = new THREE.Mesh(geo, MAT.flashing)
    mesh.position.set(0, cY, cZ)
    mesh.quaternion.copy(quat)
    mesh.castShadow = true
    mesh.receiveShadow = true
    meshes.push(mesh)

    // ── Ridge cap box ──────────────────────────────────────────────────
    const capNormalCenter = layerOffset + RIDGE_CAP_GAP + RIDGE_CAP_HEIGHT / 2
    const capRidgeExtension = (layerOffset + RIDGE_CAP_GAP + RIDGE_CAP_HEIGHT) * tanP
    const capRidgeEdge = rafterLen + capRidgeExtension
    const capCenterSlope = capRidgeEdge - RIDGE_CAP_WIDTH / 2

    const capCY = eaveTopY + capCenterSlope * sinP + capNormalCenter * cosP
    const capCZ = eaveZ + sign * capCenterSlope * cosP - sign * capNormalCenter * sinP

    const capGeo = new THREE.BoxGeometry(
      ridgeFlashing.length + RIDGE_CAP_X_EXTRA,  // X: totalLength + 0.4cm
      RIDGE_CAP_HEIGHT,                            // Y: 2.5cm perpendicular to slope
      RIDGE_CAP_WIDTH,                             // Z: 180mm across slope
    )
    const capMesh = new THREE.Mesh(capGeo, MAT.flashing)
    capMesh.position.set(0, capCY, capCZ)
    capMesh.quaternion.copy(quat)
    capMesh.castShadow = true
    capMesh.receiveShadow = true
    meshes.push(capMesh)
  }

  return meshes
}

// ── Bug Guard (ROVARHALO) ───────────────────────────────────────────────────────

/**
 * Builds bug guard meshes — wireframe plane at each eave, running the full
 * totalLength, from rafter top surface to roof batten top. Prevents bugs
 * from entering the counter-batten cavity.
 */
function buildBugGuardMeshes(
  model: StructureModel,
  bugGuard: import('../model/roofing').BugGuardModel,
  hasLamberia: boolean,
): THREE.Mesh[] {
  const DEG = Math.PI / 180
  const pitch = model.params.pitch * DEG
  const cosP = Math.cos(pitch)
  const sinP = Math.sin(pitch)

  const meshes: THREE.Mesh[] = []

  // Wireframe material — same color as flashing (RAL 8004), basic for wireframe compatibility
  const bugGuardMat = new THREE.MeshBasicMaterial({
    color: 0xCC6E52,
    wireframe: true,
  })

  // Subdivisions for mesh look: ~1.5cm grid
  const widthSegs = Math.max(2, Math.round(bugGuard.length / 0.015))
  const heightSegs = Math.max(2, Math.round(bugGuard.height / 0.015))

  for (let side = 0; side < 2; side++) {
    const isLeft = side === 0
    const sign = isLeft ? 1 : -1

    const refRafter = isLeft ? model.rafters[0] : model.rafters.find(r => r.eaveEnd.z > 0)!
    const eaveTopY = refRafter.eaveEnd.y + refRafter.depth / (2 * cosP)
    const eaveZ = refRafter.eaveEnd.z

    // Slope orientation
    const zDir = new THREE.Vector3(0, sinP, sign * cosP)
    const xDir = new THREE.Vector3(1, 0, 0)
    const yDir = new THREE.Vector3().crossVectors(zDir, xDir)
    if (yDir.y < 0) { yDir.negate(); zDir.negate() }
    const basis = new THREE.Matrix4().makeBasis(xDir, yDir, zDir)
    const quat = new THREE.Quaternion().setFromRotationMatrix(basis)

    // Center of the guard: starts at lamberia top (or rafter top), midway up the height
    const baseOffset = hasLamberia ? LAMBERIA_HEIGHT : 0
    const normalCenter = baseOffset + bugGuard.height / 2
    const cY = eaveTopY + normalCenter * cosP
    const cZ = eaveZ - sign * normalCenter * sinP

    // PlaneGeometry: width = totalLength (along X), height = guard height (along slope normal)
    const geo = new THREE.PlaneGeometry(bugGuard.length, bugGuard.height, widthSegs, heightSegs)
    const mesh = new THREE.Mesh(geo, bugGuardMat)
    mesh.position.set(0, cY, cZ)
    mesh.quaternion.copy(quat)
    meshes.push(mesh)
  }

  return meshes
}

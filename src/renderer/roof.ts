/**
 * Builds Three.js meshes from a StructureModel.
 */

import * as THREE from 'three'
import type { StructureModel, Pillar, Purlin, TieBeam, Rafter } from '../model/types'
import { PILLAR_SIZE, PURLIN_SIZE, RAFTER_WIDTH, RAFTER_DEPTH } from '../model/structure'

const MAT: Record<string, THREE.MeshLambertMaterial> = {
  pillar:  new THREE.MeshLambertMaterial({ color: 0x5a3a1a }),
  purlin:  new THREE.MeshLambertMaterial({ color: 0x7a5030 }),
  rafter:  new THREE.MeshLambertMaterial({ color: 0x9b6840 }),
}

export function buildRoofMeshes(model: StructureModel): THREE.Group {
  const group = new THREE.Group()

  for (const p of model.pillars)      group.add(pillarMesh(p))
  for (const p of model.basePurlins)  group.add(purlinMesh(p))
  for (const tb of model.tieBeams)    group.add(tieBeamMesh(tb))
  for (const r of model.rafters)      group.add(rafterMesh(r, model.params.pitch))
  group.add(purlinMesh(model.ridgePurlin))

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
  const geo = new THREE.BoxGeometry(PURLIN_SIZE, PURLIN_SIZE, len)
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
 * Custom prism geometry for a rafter:
 *   - Eave end:  perpendicular cut (face ⊥ to rafter axis)
 *   - Ridge end: vertical (plumb) cut — all four vertices at z = 0
 *
 * Vertex layout (8 vertices, indices 0-7):
 *   0 eave-top-left    4 ridge-top-left
 *   1 eave-top-right   5 ridge-top-right
 *   2 eave-bot-left    6 ridge-bot-left
 *   3 eave-bot-right   7 ridge-bot-right
 *
 * "top" = outward face (facing sky), "bot" = inward face (facing ground/interior)
 * "left/right" = along the longitudinal (X) axis of the structure.
 *
 * n_out (outward perpendicular to rafter surface in YZ plane):
 *   left slope:  (0,  cos P, -sin P)
 *   right slope: (0,  cos P, +sin P)
 *
 * Ridge vertical cut: intersect top/bottom rafter edges with plane z = 0.
 *   top y at z=0    = ridgeEnd.y + RAFTER_DEPTH / (2·cos P)
 *   bottom y at z=0 = ridgeEnd.y - RAFTER_DEPTH / (2·cos P)
 *
 * Winding: CCW from outside for the left slope.
 * Right slope is a z-mirror of left slope → flip all triangle windings.
 */
function rafterMesh(r: Rafter, pitchDeg: number): THREE.Mesh {
  const DEG = Math.PI / 180
  const cosP = Math.cos(pitchDeg * DEG)
  const sinP = Math.sin(pitchDeg * DEG)
  const isLeft = r.eaveEnd.z < 0

  const rw = RAFTER_WIDTH  // 0.075 m
  const rd = RAFTER_DEPTH  // 0.15  m
  const x  = r.eaveEnd.x  // same for both ends

  // n_out z-component: away from ridge centre
  const nz = isLeft ? -sinP : sinP

  // ── Eave end (perpendicular cut) ──────────────────────────────────────────
  const ze  = r.eaveEnd.z
  const ye  = r.eaveEnd.y
  const ety = ye + rd / 2 * cosP   // eave top y
  const etz = ze + rd / 2 * nz     // eave top z
  const eby = ye - rd / 2 * cosP   // eave bot y
  const ebz = ze - rd / 2 * nz     // eave bot z

  // ── Ridge end (vertical / plumb cut at z = 0) ─────────────────────────────
  // Derived by intersecting the top and bottom rafter edges with the plane z=0.
  const yr  = r.ridgeEnd.y
  const rty = yr + rd / (2 * cosP) // ridge top y
  const rby = yr - rd / (2 * cosP) // ridge bot y

  // ── Vertices ──────────────────────────────────────────────────────────────
  const pos = new Float32Array([
    x - rw/2, ety, etz,  // 0  eave  top  left
    x + rw/2, ety, etz,  // 1  eave  top  right
    x - rw/2, eby, ebz,  // 2  eave  bot  left
    x + rw/2, eby, ebz,  // 3  eave  bot  right
    x - rw/2, rty, 0,    // 4  ridge top  left
    x + rw/2, rty, 0,    // 5  ridge top  right
    x - rw/2, rby, 0,    // 6  ridge bot  left
    x + rw/2, rby, 0,    // 7  ridge bot  right
  ])

  // ── Triangles (CCW from outside, left-slope winding) ─────────────────────
  const tris = [
    0, 4, 5,  0, 5, 1,   // top face    (outward)
    2, 3, 7,  2, 7, 6,   // bottom face (inward)
    0, 2, 6,  0, 6, 4,   // left face   (−x)
    1, 5, 7,  1, 7, 3,   // right face  (+x)
    0, 1, 3,  0, 3, 2,   // eave face   (toward eave)
    4, 6, 7,  4, 7, 5,   // ridge face  (vertical, z=0)
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

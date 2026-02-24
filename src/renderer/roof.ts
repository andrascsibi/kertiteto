/**
 * Builds Three.js meshes from a StructureModel.
 * Each structural member is a BoxGeometry rotated/positioned to match its 3D coordinates.
 */

import * as THREE from 'three'
import type { StructureModel, Pillar, Purlin, TieBeam, Rafter } from '../model/types'
import { PILLAR_SIZE, PURLIN_SIZE, RAFTER_WIDTH, RAFTER_DEPTH } from '../model/structure'

// Shared materials — not disposed with meshes, only with scene teardown
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
  // Purlins run along X. Box dimensions: length × height × width (X × Y × Z).
  const len = Math.abs(p.end.x - p.start.x)
  const size = p.width  // square cross-section
  const geo = new THREE.BoxGeometry(len, size, size)
  const mesh = new THREE.Mesh(geo, MAT.purlin)
  mesh.position.set((p.start.x + p.end.x) / 2, p.start.y, p.start.z)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

function tieBeamMesh(tb: TieBeam): THREE.Mesh {
  // Tie beams run along Z. Box dimensions: width × height × length (X × Y × Z).
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

function rafterMesh(r: Rafter, pitchDeg: number): THREE.Mesh {
  // Box: X = rafter width (7.5cm, longitudinal), Y = rafter length (along slope), Z = rafter depth (15cm)
  // We rotate around the X axis so the local Y aligns with the rafter's slope direction.
  //
  // After rotateX(θ), local Y → (0, cosθ, sinθ) in world space.
  // Left slope:  ridge is at +Z from eave → local Y must point toward (0, sinP, cosP)
  //              → θ = π/2 − pitch
  // Right slope: ridge is at −Z from eave → local Y must point toward (0, sinP, −cosP)
  //              → θ = −(π/2 − pitch)

  const pitchRad = pitchDeg * (Math.PI / 180)
  const isLeftSlope = r.eaveEnd.z < 0

  const geo = new THREE.BoxGeometry(RAFTER_WIDTH, r.length, RAFTER_DEPTH)
  const mesh = new THREE.Mesh(geo, MAT.rafter)

  mesh.position.set(
    (r.eaveEnd.x + r.ridgeEnd.x) / 2,
    (r.eaveEnd.y + r.ridgeEnd.y) / 2,
    (r.eaveEnd.z + r.ridgeEnd.z) / 2,
  )

  mesh.rotation.x = isLeftSlope
    ? Math.PI / 2 - pitchRad
    : -(Math.PI / 2 - pitchRad)

  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

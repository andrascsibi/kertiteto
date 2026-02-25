import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildRoofMeshes } from '../src/renderer/roof'
import { buildStructure, RAFTER_DEPTH } from '../src/model/structure'
import type { InputParams } from '../src/model/types'

const base: InputParams = {
  width: 3, length: 4, pitch: 25, eavesOverhang: 0.5, gableOverhang: 0.3,
}

const DEG = Math.PI / 180

/**
 * Rafter meshes are custom prisms with exactly 8 vertices.
 * All other meshes (pillars, purlins, tie beams) use BoxGeometry which
 * produces 24 vertices. Order matches model.rafters.
 */
function rafterMeshes(model: ReturnType<typeof buildStructure>): THREE.Mesh[] {
  const group = buildRoofMeshes(model)
  return group.children.filter(
    c => c instanceof THREE.Mesh &&
         (c as THREE.Mesh).geometry.attributes.position.count === 8
  ) as THREE.Mesh[]
}

describe('rafter mesh — eave end (vertical/plumb cut)', () => {
  it('all four eave vertices have z = eaveEnd.z', () => {
    const m = buildStructure(base)
    const meshes = rafterMeshes(m)
    expect(meshes.length).toBe(m.rafters.length)

    for (let i = 0; i < meshes.length; i++) {
      const pos = meshes[i].geometry.attributes.position.array as Float32Array
      const ze = m.rafters[i].eaveEnd.z
      // Vertices 0–3 are the eave end
      for (let v = 0; v < 4; v++) {
        expect(pos[v * 3 + 2]).toBeCloseTo(ze, 5)
      }
    }
  })

  it('eave top y = eaveEnd.y + RAFTER_DEPTH/(2·cosP)', () => {
    const pitch = 25, W = 3, E = 0.5
    const cosP = Math.cos(pitch * DEG)
    const m = buildStructure({ ...base, width: W, pitch, eavesOverhang: E })
    const meshes = rafterMeshes(m)

    for (let i = 0; i < meshes.length; i++) {
      const pos = meshes[i].geometry.attributes.position.array as Float32Array
      const expectedTopY = m.rafters[i].eaveEnd.y + RAFTER_DEPTH / (2 * cosP)
      expect(pos[0 * 3 + 1]).toBeCloseTo(expectedTopY, 5)  // vertex 0: eave top left
      expect(pos[1 * 3 + 1]).toBeCloseTo(expectedTopY, 5)  // vertex 1: eave top right
    }
  })

  it('eave bottom y = eaveEnd.y - RAFTER_DEPTH/(2·cosP)', () => {
    const pitch = 25, W = 3, E = 0.5
    const cosP = Math.cos(pitch * DEG)
    const m = buildStructure({ ...base, width: W, pitch, eavesOverhang: E })
    const meshes = rafterMeshes(m)

    for (let i = 0; i < meshes.length; i++) {
      const pos = meshes[i].geometry.attributes.position.array as Float32Array
      const expectedBotY = m.rafters[i].eaveEnd.y - RAFTER_DEPTH / (2 * cosP)
      expect(pos[2 * 3 + 1]).toBeCloseTo(expectedBotY, 5)  // vertex 2: eave bot left
      expect(pos[3 * 3 + 1]).toBeCloseTo(expectedBotY, 5)  // vertex 3: eave bot right
    }
  })
})

describe('rafter mesh — ridge end (vertical/plumb cut, existing)', () => {
  it('all four ridge vertices have z = 0', () => {
    const m = buildStructure(base)
    const meshes = rafterMeshes(m)

    for (const mesh of meshes) {
      const pos = mesh.geometry.attributes.position.array as Float32Array
      // Vertices 4–7 are the ridge end
      for (let v = 4; v < 8; v++) {
        expect(pos[v * 3 + 2]).toBeCloseTo(0, 5)
      }
    }
  })

  it('ridge top y = ridgeEnd.y + RAFTER_DEPTH/(2·cosP)', () => {
    const pitch = 25
    const cosP = Math.cos(pitch * DEG)
    const m = buildStructure({ ...base, pitch })
    const meshes = rafterMeshes(m)

    for (let i = 0; i < meshes.length; i++) {
      const pos = meshes[i].geometry.attributes.position.array as Float32Array
      const expectedTopY = m.rafters[i].ridgeEnd.y + RAFTER_DEPTH / (2 * cosP)
      expect(pos[4 * 3 + 1]).toBeCloseTo(expectedTopY, 5)  // vertex 4: ridge top left
      expect(pos[5 * 3 + 1]).toBeCloseTo(expectedTopY, 5)  // vertex 5: ridge top right
    }
  })

  it('ridge bottom y = ridgeEnd.y - RAFTER_DEPTH/(2·cosP)', () => {
    const pitch = 25
    const cosP = Math.cos(pitch * DEG)
    const m = buildStructure({ ...base, pitch })
    const meshes = rafterMeshes(m)

    for (let i = 0; i < meshes.length; i++) {
      const pos = meshes[i].geometry.attributes.position.array as Float32Array
      const expectedBotY = m.rafters[i].ridgeEnd.y - RAFTER_DEPTH / (2 * cosP)
      expect(pos[6 * 3 + 1]).toBeCloseTo(expectedBotY, 5)  // vertex 6: ridge bot left
      expect(pos[7 * 3 + 1]).toBeCloseTo(expectedBotY, 5)  // vertex 7: ridge bot right
    }
  })
})

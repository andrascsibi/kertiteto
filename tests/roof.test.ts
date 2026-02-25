import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildRoofMeshes } from '../src/renderer/roof'
import { buildStructure, RAFTER_DEPTH } from '../src/model/structure'
import { EAVE_PLUMB_HEIGHT } from '../src/model/geometry'
import type { InputParams } from '../src/model/types'

const base: InputParams = {
  width: 3, length: 4, pitch: 25, eavesOverhang: 0.5, gableOverhang: 0.3,
}

const DEG = Math.PI / 180

/**
 * Rafter meshes are custom prisms with exactly 10 vertices.
 * All other meshes (pillars, purlins, tie beams) use BoxGeometry which
 * produces 24 vertices. Order matches model.rafters.
 *
 * Vertex layout:
 *   0 eave-top-left      6 ridge-top-left
 *   1 eave-top-right     7 ridge-top-right
 *   2 soffit-eave-left   8 ridge-bot-left
 *   3 soffit-eave-right  9 ridge-bot-right
 *   4 soffit-inner-left
 *   5 soffit-inner-right
 */
function rafterMeshes(model: ReturnType<typeof buildStructure>): THREE.Mesh[] {
  const group = buildRoofMeshes(model)
  return group.children.filter(
    c => c instanceof THREE.Mesh &&
         (c as THREE.Mesh).geometry.attributes.position.count === 10
  ) as THREE.Mesh[]
}

describe('rafter mesh — eave end', () => {
  it('plumb-face vertices (0-3) all have z = eaveEnd.z', () => {
    const m = buildStructure(base)
    const meshes = rafterMeshes(m)
    expect(meshes.length).toBe(m.rafters.length)

    for (let i = 0; i < meshes.length; i++) {
      const pos = meshes[i].geometry.attributes.position.array as Float32Array
      const ze = m.rafters[i].eaveEnd.z
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
      expect(pos[0 * 3 + 1]).toBeCloseTo(expectedTopY, 5)  // vertex 0: eave-top-left
      expect(pos[1 * 3 + 1]).toBeCloseTo(expectedTopY, 5)  // vertex 1: eave-top-right
    }
  })

  it('soffit y = eave top y - EAVE_PLUMB_HEIGHT (vertices 2-5)', () => {
    const pitch = 25, W = 3, E = 0.5
    const cosP = Math.cos(pitch * DEG)
    const m = buildStructure({ ...base, width: W, pitch, eavesOverhang: E })
    const meshes = rafterMeshes(m)

    for (let i = 0; i < meshes.length; i++) {
      const pos = meshes[i].geometry.attributes.position.array as Float32Array
      const expectedSoffitY = m.rafters[i].eaveEnd.y + RAFTER_DEPTH / (2 * cosP) - EAVE_PLUMB_HEIGHT
      for (let v = 2; v < 6; v++) {
        expect(pos[v * 3 + 1]).toBeCloseTo(expectedSoffitY, 5)
      }
    }
  })

  it('soffit-inner z = ze ± (RAFTER_DEPTH/cosP - EAVE_PLUMB_HEIGHT)/tanP (vertices 4-5)', () => {
    const pitch = 25, W = 3, E = 0.5
    const cosP = Math.cos(pitch * DEG)
    const tanP = Math.tan(pitch * DEG)
    const m = buildStructure({ ...base, width: W, pitch, eavesOverhang: E })
    const meshes = rafterMeshes(m)

    for (let i = 0; i < meshes.length; i++) {
      const pos = meshes[i].geometry.attributes.position.array as Float32Array
      const ze = m.rafters[i].eaveEnd.z
      const swd = (RAFTER_DEPTH / cosP - EAVE_PLUMB_HEIGHT) / tanP
      const expectedZsi = ze + (ze < 0 ? swd : -swd)  // toward ridge
      expect(pos[4 * 3 + 2]).toBeCloseTo(expectedZsi, 5)  // vertex 4
      expect(pos[5 * 3 + 2]).toBeCloseTo(expectedZsi, 5)  // vertex 5
    }
  })
})

describe('rafter mesh — ridge end', () => {
  it('all four ridge vertices have z = 0', () => {
    const m = buildStructure(base)
    const meshes = rafterMeshes(m)

    for (const mesh of meshes) {
      const pos = mesh.geometry.attributes.position.array as Float32Array
      for (let v = 6; v < 10; v++) {
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
      expect(pos[6 * 3 + 1]).toBeCloseTo(expectedTopY, 5)  // vertex 6: ridge-top-left
      expect(pos[7 * 3 + 1]).toBeCloseTo(expectedTopY, 5)  // vertex 7: ridge-top-right
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
      expect(pos[8 * 3 + 1]).toBeCloseTo(expectedBotY, 5)  // vertex 8: ridge-bot-left
      expect(pos[9 * 3 + 1]).toBeCloseTo(expectedBotY, 5)  // vertex 9: ridge-bot-right
    }
  })
})

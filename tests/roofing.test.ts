import { describe, it, expect } from 'vitest'
import { buildRoofing, counterBattenTotalLength, roofBattenTotalLength, ROOF_BATTEN_DISTANCE } from '../src/model/roofing'
import { buildStructure } from '../src/model/structure'
import type { InputParams } from '../src/model/types'

const base: InputParams = {
  width: 3,
  length: 4,
  pitch: 25,
  eavesOverhang: 0.5,
  gableOverhang: 0.3,
}

const opts = { membrane: false, roofing: false }

describe('counter battens', () => {
  const structure = buildStructure(base)

  it('one counter batten per rafter when membrane enabled', () => {
    const roofing = buildRoofing(structure, { ...opts, membrane: true })
    expect(roofing.counterBattens.length).toBe(structure.rafters.length)
  })

  it('counter batten lengths match rafter lengths', () => {
    const roofing = buildRoofing(structure, { ...opts, membrane: true })
    for (let i = 0; i < structure.rafters.length; i++) {
      expect(roofing.counterBattens[i].length).toBe(structure.rafters[i].length)
    }
  })

  it('no counter battens when membrane disabled', () => {
    const roofing = buildRoofing(structure, { ...opts, membrane: false })
    expect(roofing.counterBattens.length).toBe(0)
  })

  it('total length sums all counter batten lengths', () => {
    const roofing = buildRoofing(structure, { ...opts, membrane: true })
    const expected = structure.rafters.reduce((sum, r) => sum + r.length, 0)
    expect(counterBattenTotalLength(roofing)).toBeCloseTo(expected, 6)
  })

  it('total length is zero when membrane disabled', () => {
    const roofing = buildRoofing(structure, { ...opts, membrane: false })
    expect(counterBattenTotalLength(roofing)).toBe(0)
  })
})

describe('roof battens', () => {
  const structure = buildStructure(base)
  const rafterLen = structure.rafters[0].length
  const battenLength = base.length + 2 * base.gableOverhang

  it('correct number of rows for both slopes', () => {
    const roofing = buildRoofing(structure, { ...opts, roofing: true })
    const rowsPerSlope = Math.ceil(rafterLen / ROOF_BATTEN_DISTANCE) + 1 + 1
    expect(roofing.roofBattens.length).toBe(rowsPerSlope * 2)
  })

  it('each batten length equals building total length', () => {
    const roofing = buildRoofing(structure, { ...opts, roofing: true })
    for (const rb of roofing.roofBattens) {
      expect(rb.length).toBeCloseTo(battenLength, 6)
    }
  })

  it('no roof battens when roofing disabled', () => {
    const roofing = buildRoofing(structure, { ...opts, roofing: false })
    expect(roofing.roofBattens.length).toBe(0)
  })

  it('total length sums correctly', () => {
    const roofing = buildRoofing(structure, { ...opts, roofing: true })
    const rowsPerSlope = Math.ceil(rafterLen / ROOF_BATTEN_DISTANCE) + 1 + 1
    const expected = rowsPerSlope * 2 * battenLength
    expect(roofBattenTotalLength(roofing)).toBeCloseTo(expected, 6)
  })
})

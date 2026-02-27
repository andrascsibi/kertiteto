import { describe, it, expect } from 'vitest'
import { buildRoofing, counterBattenTotalLength } from '../src/model/roofing'
import { buildStructure } from '../src/model/structure'
import type { InputParams } from '../src/model/types'

const base: InputParams = {
  width: 3,
  length: 4,
  pitch: 25,
  eavesOverhang: 0.5,
  gableOverhang: 0.3,
}

describe('counter battens', () => {
  const structure = buildStructure(base)

  it('one counter batten per rafter when membrane enabled', () => {
    const roofing = buildRoofing(structure, { membrane: true })
    expect(roofing.counterBattens.length).toBe(structure.rafters.length)
  })

  it('counter batten lengths match rafter lengths', () => {
    const roofing = buildRoofing(structure, { membrane: true })
    for (let i = 0; i < structure.rafters.length; i++) {
      expect(roofing.counterBattens[i].length).toBe(structure.rafters[i].length)
    }
  })

  it('no counter battens when membrane disabled', () => {
    const roofing = buildRoofing(structure, { membrane: false })
    expect(roofing.counterBattens.length).toBe(0)
  })

  it('total length sums all counter batten lengths', () => {
    const roofing = buildRoofing(structure, { membrane: true })
    const expected = structure.rafters.reduce((sum, r) => sum + r.length, 0)
    expect(counterBattenTotalLength(roofing)).toBeCloseTo(expected, 6)
  })

  it('total length is zero when membrane disabled', () => {
    const roofing = buildRoofing(structure, { membrane: false })
    expect(counterBattenTotalLength(roofing)).toBe(0)
  })
})

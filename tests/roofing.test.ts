import { describe, it, expect } from 'vitest'
import { buildRoofing, counterBattenTotalLength, roofBattenTotalLength, flashingTotalSurface, ROOF_BATTEN_DISTANCE, FLASHING_LENGTH, FLASHING_OVERLAP, FLASHING_DEVELOPED_WIDTH, LAMBERIA_WIDTH } from '../src/model/roofing'
import { buildStructure } from '../src/model/structure'
import type { InputParams } from '../src/model/types'

const base: InputParams = {
  width: 3,
  length: 4,
  pitch: 25,
  eavesOverhang: 0.5,
  gableOverhang: 0.3,
}

const opts = { lamberia: false, membrane: false, roofing: false }

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

describe('flashings', () => {
  const structure = buildStructure(base)
  const totalLength = base.length + 2 * base.gableOverhang  // 4.6
  const effectiveLen = FLASHING_LENGTH - FLASHING_OVERLAP    // 1.9
  const rafterLen = structure.rafters[0].length

  it('no flashings when roofing disabled', () => {
    const roofing = buildRoofing(structure, { ...opts, roofing: false })
    expect(roofing.flashings).toBeNull()
    expect(flashingTotalSurface(roofing)).toBe(0)
  })

  it('correct drip edge and eaves flashing piece count', () => {
    const roofing = buildRoofing(structure, { ...opts, roofing: true })
    const eavesRun = totalLength * 2
    const expected = Math.ceil(eavesRun / effectiveLen)
    expect(roofing.flashings!.dripEdge.count).toBe(expected)
    expect(roofing.flashings!.eavesFlashing.count).toBe(expected)
  })

  it('correct ridge flashing piece count', () => {
    const roofing = buildRoofing(structure, { ...opts, roofing: true })
    const expected = Math.ceil(totalLength / effectiveLen)
    expect(roofing.flashings!.ridgeFlashing.count).toBe(expected)
  })

  it('correct gable flashing piece count', () => {
    const roofing = buildRoofing(structure, { ...opts, roofing: true })
    const gableRun = rafterLen * 4
    const expected = Math.ceil(gableRun / effectiveLen)
    expect(roofing.flashings!.gableFlashing.count).toBe(expected)
  })

  it('surface computed from count × length × developed width', () => {
    const roofing = buildRoofing(structure, { ...opts, roofing: true })
    const f = roofing.flashings!
    expect(f.dripEdge.surface).toBeCloseTo(f.dripEdge.count * FLASHING_LENGTH * FLASHING_DEVELOPED_WIDTH.dripEdge, 6)
    expect(f.eavesFlashing.surface).toBeCloseTo(f.eavesFlashing.count * FLASHING_LENGTH * FLASHING_DEVELOPED_WIDTH.eavesFlashing, 6)
    expect(f.ridgeFlashing.surface).toBeCloseTo(f.ridgeFlashing.count * FLASHING_LENGTH * FLASHING_DEVELOPED_WIDTH.ridgeFlashing, 6)
    expect(f.gableFlashing.surface).toBeCloseTo(f.gableFlashing.count * FLASHING_LENGTH * FLASHING_DEVELOPED_WIDTH.gableFlashing, 6)
  })

  it('totalSurface sums all groups', () => {
    const roofing = buildRoofing(structure, { ...opts, roofing: true })
    const f = roofing.flashings!
    const expected = f.dripEdge.surface + f.eavesFlashing.surface + f.ridgeFlashing.surface + f.gableFlashing.surface
    expect(f.totalSurface).toBeCloseTo(expected, 6)
    expect(flashingTotalSurface(roofing)).toBeCloseTo(expected, 6)
  })
})

describe('lamberia', () => {
  const structure = buildStructure(base)
  const rafterLen = structure.rafters[0].length

  it('no lamberia when disabled', () => {
    const roofing = buildRoofing(structure, { ...opts, lamberia: false })
    expect(roofing.lamberia).toBeNull()
  })

  it('correct planks per slope', () => {
    const roofing = buildRoofing(structure, { ...opts, lamberia: true })
    expect(roofing.lamberia!.planksPerSlope).toBe(Math.ceil(rafterLen / LAMBERIA_WIDTH))
  })

  it('plank length equals totalLength', () => {
    const roofing = buildRoofing(structure, { ...opts, lamberia: true })
    expect(roofing.lamberia!.plankLength).toBe(structure.totalLength)
  })
})

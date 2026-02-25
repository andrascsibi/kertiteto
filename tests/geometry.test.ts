import { describe, it, expect } from 'vitest'
import {
  ridgeHeight,
  rafterLength,
  pillarCount,
  rafterSpacing,
  rafterCount,
  birdMouthAtBasePurlin,
  birdMouthAtRidgePurlin,
  MAX_UNSUPPORTED_SPAN,
} from '../src/model/geometry'
import { PILLAR_SIZE } from '../src/model/structure'

const DEG = Math.PI / 180

describe('ridgeHeight', () => {
  it('half-span * tan(pitch)', () => {
    // width=4m, pitch=25°: half-span=2m, ridge = 2 * tan(25°)
    expect(ridgeHeight(4, 25)).toBeCloseTo(2 * Math.tan(25 * DEG), 6)
  })

  it('is zero for zero pitch', () => {
    expect(ridgeHeight(4, 0)).toBe(0)
  })
})

describe('rafterLength', () => {
  it('horizontal run / cos(pitch), run = half-width + eavesOverhang', () => {
    // width=4m, eaves=0.5m → run = 2.5m, pitch=25°
    const expected = 2.5 / Math.cos(25 * DEG)
    expect(rafterLength(4, 25, 0.5)).toBeCloseTo(expected, 6)
  })

  it('longer with larger eaves overhang', () => {
    expect(rafterLength(4, 25, 0.6)).toBeGreaterThan(rafterLength(4, 25, 0.5))
  })
})

describe('pillarCount', () => {
  // innerSpan = length - 2 * PILLAR_SIZE
  // bays = ceil(innerSpan / MAX_UNSUPPORTED_SPAN)
  // pillarRows = bays + 1, total = pillarRows * 2

  it('minimum 4 pillars (2 rows) for short structures', () => {
    expect(pillarCount(2.0)).toBe(4)
    expect(pillarCount(MAX_UNSUPPORTED_SPAN + 2 * PILLAR_SIZE)).toBe(4)
  })

  it('6 pillars (3 rows) when one intermediate row is needed', () => {
    expect(pillarCount(MAX_UNSUPPORTED_SPAN + 2 * PILLAR_SIZE + 0.01)).toBe(6)
    expect(pillarCount(2 * MAX_UNSUPPORTED_SPAN + 2 * PILLAR_SIZE)).toBe(6)
  })

  it('8 pillars (4 rows) when two intermediate rows are needed', () => {
    expect(pillarCount(2 * MAX_UNSUPPORTED_SPAN + 2 * PILLAR_SIZE + 0.01)).toBe(8)
    expect(pillarCount(3 * MAX_UNSUPPORTED_SPAN + 2 * PILLAR_SIZE)).toBe(8)
  })

  it('scales to 20m structures', () => {
    // innerSpan = 20 - 0.3 = 19.7, bays = ceil(19.7/3.5) = 6, rows = 7
    expect(pillarCount(20)).toBe(14)
  })

  it('unsupported span never exceeds MAX_UNSUPPORTED_SPAN', () => {
    for (const L of [2, 3, 4, 5, 7, 10, 15, 20]) {
      const rows = pillarCount(L) / 2
      const innerSpan = L - 2 * PILLAR_SIZE
      const actualSpan = innerSpan / (rows - 1)
      expect(actualSpan).toBeLessThanOrEqual(MAX_UNSUPPORTED_SPAN + 1e-9)
    }
  })
})

describe('rafterSpacing', () => {
  it('divides length into equal bays, max 90cm', () => {
    // length=4m: ceil(4/0.9)=5 bays → spacing = 4/5 = 0.8m
    expect(rafterSpacing(4)).toBeCloseTo(0.8, 6)
  })

  it('never exceeds 0.9m', () => {
    for (const l of [2, 3, 4, 5, 6, 7]) {
      expect(rafterSpacing(l)).toBeLessThanOrEqual(0.9 + 1e-9)
    }
  })
})

describe('rafterCount', () => {
  it('number of bays + 1 (includes both gable rafters)', () => {
    // length=4m, spacing=0.8m → 5 bays → 6 rafters
    expect(rafterCount(4)).toBe(6)
  })

  it('minimum 2 rafters (one at each gable)', () => {
    expect(rafterCount(0.5)).toBeGreaterThanOrEqual(2)
  })
})

describe('birdMouthAtBasePurlin', () => {
  it('plumb cut is fixed at 3 cm (keeps 4/5 of 15 cm rafter depth)', () => {
    expect(birdMouthAtBasePurlin(25).plumbHeight).toBeCloseTo(0.03, 6)
  })

  it('seat depth = plumbHeight / tan(pitch)', () => {
    const bm = birdMouthAtBasePurlin(25)
    expect(bm.seatDepth).toBeCloseTo(0.03 / Math.tan(25 * DEG), 6)
  })

  it('steeper pitch → smaller seat depth', () => {
    expect(birdMouthAtBasePurlin(30).seatDepth).toBeLessThan(birdMouthAtBasePurlin(25).seatDepth)
  })
})

describe('birdMouthAtRidgePurlin', () => {
  it('seat depth is fixed at 5 cm (half of 10 cm ridge purlin)', () => {
    expect(birdMouthAtRidgePurlin(25).seatDepth).toBeCloseTo(0.05, 6)
  })

  it('plumb cut is fixed at 3 cm', () => {
    expect(birdMouthAtRidgePurlin(25).plumbHeight).toBeCloseTo(0.03, 6)
  })

  it('seat depth does not change with pitch (ridge purlin is fixed geometry)', () => {
    expect(birdMouthAtRidgePurlin(30).seatDepth).toBeCloseTo(0.05, 6)
  })
})

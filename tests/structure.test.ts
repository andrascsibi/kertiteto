import { describe, it, expect } from 'vitest'
import { buildStructure, PILLAR_HEIGHT, PURLIN_SIZE } from '../src/model/structure'
import { ridgeHeight, rafterCount, rafterSpacing } from '../src/model/geometry'
import type { InputParams } from '../src/model/types'

// Coordinate system:
//   X: longitudinal (along ridge), Y: vertical (up), Z: cross-sectional (across span)
//   Origin: center of footprint at ground level
//   Width and length are center-to-center pillar distances.

const base: InputParams = {
  width: 3,
  length: 4,
  pitch: 25,
  eavesOverhang: 0.5,
  gableOverhang: 0.3,
}

describe('pillars', () => {
  it('4 pillars for length <= 3.5m', () => {
    expect(buildStructure({ ...base, length: 3 }).pillars.length).toBe(4)
    expect(buildStructure({ ...base, length: 3.5 }).pillars.length).toBe(4)
  })

  it('6 pillars for length > 3.5m', () => {
    expect(buildStructure({ ...base, length: 3.51 }).pillars.length).toBe(6)
    expect(buildStructure({ ...base, length: 7 }).pillars.length).toBe(6)
  })

  it('corner pillars at x=±length/2, z=±width/2', () => {
    const m = buildStructure({ ...base, length: 3, width: 3 })
    const corners = [
      { x: -1.5, z: -1.5 }, { x: -1.5, z: 1.5 },
      { x: 1.5, z: -1.5 },  { x: 1.5, z: 1.5 },
    ]
    for (const c of corners) {
      expect(m.pillars.some(p =>
        Math.abs(p.base.x - c.x) < 1e-9 &&
        Math.abs(p.base.z - c.z) < 1e-9
      )).toBe(true)
    }
  })

  it('middle pillars at x=0 for 6-pillar structure', () => {
    const m = buildStructure({ ...base, length: 5 })
    const mid = m.pillars.filter(p => Math.abs(p.base.x) < 1e-9)
    expect(mid.length).toBe(2)
    expect(mid.some(p => p.base.z < 0)).toBe(true)
    expect(mid.some(p => p.base.z > 0)).toBe(true)
  })

  it('all pillars base at y=0 with correct height', () => {
    const m = buildStructure(base)
    for (const p of m.pillars) {
      expect(p.base.y).toBe(0)
      expect(p.height).toBe(PILLAR_HEIGHT)
    }
  })
})

describe('base purlins', () => {
  it('two purlins at z=±width/2', () => {
    const W = 3
    const m = buildStructure({ ...base, width: W })
    expect(m.basePurlins[0].start.z).toBeCloseTo(-W / 2, 6)
    expect(m.basePurlins[1].start.z).toBeCloseTo(+W / 2, 6)
  })

  it('extend from -(L/2+gableOverhang) to +(L/2+gableOverhang)', () => {
    const G = 0.3, L = 4
    const m = buildStructure({ ...base, length: L, gableOverhang: G })
    expect(m.basePurlins[0].start.x).toBeCloseTo(-(L / 2 + G), 6)
    expect(m.basePurlins[0].end.x).toBeCloseTo(+(L / 2 + G), 6)
  })

  it('sit on top of pillars: y center = pillarHeight + PURLIN_SIZE/2', () => {
    const m = buildStructure(base)
    const expectedY = PILLAR_HEIGHT + PURLIN_SIZE / 2
    expect(m.basePurlins[0].start.y).toBeCloseTo(expectedY, 6)
    expect(m.basePurlins[1].start.y).toBeCloseTo(expectedY, 6)
  })

  it('both purlins are at the same y (level)', () => {
    const m = buildStructure(base)
    expect(m.basePurlins[0].start.y).toBeCloseTo(m.basePurlins[1].start.y, 6)
  })
})

describe('ridge purlin', () => {
  it('at z=0', () => {
    const m = buildStructure(base)
    expect(m.ridgePurlin.start.z).toBeCloseTo(0, 6)
    expect(m.ridgePurlin.end.z).toBeCloseTo(0, 6)
  })

  it('at y = pillarHeight + PURLIN_SIZE + ridgeHeight(width, pitch)', () => {
    const W = 4, pitch = 25
    const m = buildStructure({ ...base, width: W, pitch })
    const expectedY = PILLAR_HEIGHT + PURLIN_SIZE + ridgeHeight(W, pitch)
    expect(m.ridgePurlin.start.y).toBeCloseTo(expectedY, 6)
  })

  it('spans the same x range as base purlins', () => {
    const m = buildStructure(base)
    expect(m.ridgePurlin.start.x).toBeCloseTo(m.basePurlins[0].start.x, 6)
    expect(m.ridgePurlin.end.x).toBeCloseTo(m.basePurlins[0].end.x, 6)
  })

  it('is higher than base purlins', () => {
    const m = buildStructure(base)
    expect(m.ridgePurlin.start.y).toBeGreaterThan(m.basePurlins[0].start.y)
  })
})

describe('tie beams (KOTOGERENDA)', () => {
  it('always 2 tie beams regardless of pillar count', () => {
    expect(buildStructure({ ...base, length: 3 }).tieBeams.length).toBe(2)
    expect(buildStructure({ ...base, length: 5 }).tieBeams.length).toBe(2)
  })

  it('positioned at x=±length/2 (corner pillar positions)', () => {
    const L = 4
    const m = buildStructure({ ...base, length: L })
    const xVals = m.tieBeams.map(tb => tb.start.x).sort((a, b) => a - b)
    expect(xVals[0]).toBeCloseTo(-L / 2, 6)
    expect(xVals[1]).toBeCloseTo(+L / 2, 6)
  })

  it('connect z=-width/2 to z=+width/2', () => {
    const W = 3
    const m = buildStructure({ ...base, width: W })
    for (const tb of m.tieBeams) {
      const zVals = [tb.start.z, tb.end.z].sort((a, b) => a - b)
      expect(zVals[0]).toBeCloseTo(-W / 2, 6)
      expect(zVals[1]).toBeCloseTo(+W / 2, 6)
    }
  })

  it('are at the same height as base purlin centers', () => {
    const m = buildStructure(base)
    const expectedY = PILLAR_HEIGHT + PURLIN_SIZE / 2
    for (const tb of m.tieBeams) {
      expect(tb.start.y).toBeCloseTo(expectedY, 6)
    }
  })
})

describe('rafters', () => {
  it('total count = 2 * rafterCount(length), first half left slope, second half right', () => {
    const L = 4
    const m = buildStructure({ ...base, length: L })
    const n = rafterCount(L)
    expect(m.rafters.length).toBe(2 * n)
    // Left slope: eave at z < 0
    for (let i = 0; i < n; i++) {
      expect(m.rafters[i].eaveEnd.z).toBeLessThan(0)
    }
    // Right slope: eave at z > 0
    for (let i = n; i < 2 * n; i++) {
      expect(m.rafters[i].eaveEnd.z).toBeGreaterThan(0)
    }
  })

  it('all rafters meet at z=0 (ridge)', () => {
    const m = buildStructure(base)
    for (const r of m.rafters) {
      expect(r.ridgeEnd.z).toBeCloseTo(0, 6)
    }
  })

  it('gable rafters at x=±length/2', () => {
    const L = 4
    const m = buildStructure({ ...base, length: L })
    const n = rafterCount(L)
    const xVals = m.rafters.slice(0, n).map(r => r.eaveEnd.x).sort((a, b) => a - b)
    expect(xVals[0]).toBeCloseTo(-L / 2, 6)
    expect(xVals[xVals.length - 1]).toBeCloseTo(+L / 2, 6)
  })

  it('rafters are evenly spaced along x', () => {
    const L = 4
    const m = buildStructure({ ...base, length: L })
    const n = rafterCount(L)
    const spacing = rafterSpacing(L)
    const xVals = m.rafters.slice(0, n).map(r => r.eaveEnd.x).sort((a, b) => a - b)
    for (let i = 1; i < xVals.length; i++) {
      expect(xVals[i] - xVals[i - 1]).toBeCloseTo(spacing, 6)
    }
  })

  it('left and right slope rafters share x positions', () => {
    const L = 4
    const m = buildStructure({ ...base, length: L })
    const n = rafterCount(L)
    for (let i = 0; i < n; i++) {
      expect(m.rafters[i].eaveEnd.x).toBeCloseTo(m.rafters[n + i].eaveEnd.x, 6)
    }
  })

  it('eave ends are eavesOverhang past base purlins in z', () => {
    const E = 0.5, W = 3
    const m = buildStructure({ ...base, width: W, eavesOverhang: E })
    const n = rafterCount(base.length)
    // Left slope eave at z = -(W/2 + E)
    expect(m.rafters[0].eaveEnd.z).toBeCloseTo(-(W / 2 + E), 6)
    // Right slope eave at z = +(W/2 + E)
    expect(m.rafters[n].eaveEnd.z).toBeCloseTo(+(W / 2 + E), 6)
  })

  it('ridge ends are at correct height', () => {
    const W = 3, pitch = 25
    const m = buildStructure({ ...base, width: W, pitch })
    const expectedY = PILLAR_HEIGHT + PURLIN_SIZE + ridgeHeight(W, pitch)
    for (const r of m.rafters) {
      expect(r.ridgeEnd.y).toBeCloseTo(expectedY, 6)
    }
  })
})

describe('rafter bird mouths', () => {
  it('base bird mouth plumb height is 3cm on all rafters', () => {
    const m = buildStructure(base)
    for (const r of m.rafters) {
      expect(r.birdMouthBase.plumbHeight).toBeCloseTo(0.03, 6)
    }
  })

  it('ridge bird mouth seat depth is 5cm on all rafters', () => {
    const m = buildStructure(base)
    for (const r of m.rafters) {
      expect(r.birdMouthRidge.seatDepth).toBeCloseTo(0.05, 6)
    }
  })

  it('base bird mouth distanceFromEave = eavesOverhang / cos(pitch)', () => {
    const E = 0.5, pitch = 25
    const DEG = Math.PI / 180
    const m = buildStructure({ ...base, eavesOverhang: E, pitch })
    const expected = E / Math.cos(pitch * DEG)
    for (const r of m.rafters) {
      expect(r.birdMouthBase.distanceFromEave).toBeCloseTo(expected, 6)
    }
  })

  it('ridge bird mouth is further from eave than base bird mouth', () => {
    const m = buildStructure(base)
    for (const r of m.rafters) {
      expect(r.birdMouthRidge.distanceFromEave).toBeGreaterThan(r.birdMouthBase.distanceFromEave)
    }
  })
})

import { describe, it, expect } from 'vitest'
import { buildStructure, PILLAR_HEIGHT, PILLAR_SIZE, PURLIN_SIZE, RIDGE_SIZE, RAFTER_WIDTH, RAFTER_DEPTH } from '../src/model/structure'
import { ridgeHeight, BIRD_MOUTH_PLUMB_HEIGHT, MAX_RAFTER_SPACING, MAX_UNSUPPORTED_SPAN } from '../src/model/geometry'
import type { InputParams } from '../src/model/types'

// Coordinate system:
//   X: longitudinal (along ridge), Y: vertical (up), Z: cross-sectional (across span)
//   Origin: center of footprint at ground level
//   Width and length are outer-edge-to-outer-edge pillar distances.

const base: InputParams = {
  width: 3,
  length: 4,
  pitch: 25,
  eavesOverhang: 0.5,
  gableOverhang: 0.3,
}

const DEG = Math.PI / 180

// Helper: number of rafters based on purlin span (matching structure.ts logic)
function expectedRafterCount(params: InputParams): number {
  const purlinLength = params.length + 2 * params.gableOverhang
  const rafterSpanCC = purlinLength - RAFTER_WIDTH
  return Math.ceil(rafterSpanCC / MAX_RAFTER_SPACING) + 1
}

describe('pillars', () => {
  it('4 pillars when unsupported span <= MAX_UNSUPPORTED_SPAN', () => {
    const threshold = MAX_UNSUPPORTED_SPAN + 2 * PILLAR_SIZE
    expect(buildStructure({ ...base, length: 3 }).pillars.length).toBe(4)
    expect(buildStructure({ ...base, length: threshold }).pillars.length).toBe(4)
  })

  it('6 pillars when unsupported span > MAX_UNSUPPORTED_SPAN', () => {
    const threshold = MAX_UNSUPPORTED_SPAN + 2 * PILLAR_SIZE
    expect(buildStructure({ ...base, length: threshold + 0.01 }).pillars.length).toBe(6)
    expect(buildStructure({ ...base, length: 7 }).pillars.length).toBe(6)
  })

  it('corner pillar centers inset by PILLAR_SIZE/2 from outer edges', () => {
    const W = 3, L = 3
    const m = buildStructure({ ...base, length: L, width: W })
    const xH = L / 2 - PILLAR_SIZE / 2
    const zH = W / 2 - PILLAR_SIZE / 2
    const corners = [
      { x: -xH, z: -zH }, { x: -xH, z: zH },
      { x: xH, z: -zH },  { x: xH, z: zH },
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
  it('purlin centers at z=±(width/2 - PURLIN_SIZE/2), outer face flush at ±width/2', () => {
    const W = 3
    const m = buildStructure({ ...base, width: W })
    const zPurlin = W / 2 - PURLIN_SIZE / 2
    expect(m.basePurlins[0].start.z).toBeCloseTo(-zPurlin, 6)
    expect(m.basePurlins[1].start.z).toBeCloseTo(+zPurlin, 6)
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

  it('center at y = yBasePurlinTop + ridgeHeight(width - RIDGE_SIZE, pitch) - RIDGE_SIZE/2 (bird-line geometry)', () => {
    const W = 4, pitch = 25
    const m = buildStructure({ ...base, width: W, pitch })
    const yBasePurlinTop = PILLAR_HEIGHT + PURLIN_SIZE
    const expectedY = yBasePurlinTop + ridgeHeight(W - RIDGE_SIZE, pitch) - RIDGE_SIZE / 2
    expect(m.ridgePurlin.start.y).toBeCloseTo(expectedY, 6)
  })

  it('spans the same x range as base purlins', () => {
    const m = buildStructure(base)
    expect(m.ridgePurlin.start.x).toBeCloseTo(m.basePurlins[0].start.x, 6)
    expect(m.ridgePurlin.end.x).toBeCloseTo(m.basePurlins[0].end.x, 6)
  })

  it('is above base purlins', () => {
    const m = buildStructure(base)
    expect(m.ridgePurlin.start.y).toBeGreaterThan(m.basePurlins[0].start.y)
  })

  it('rafters extend above ridge purlin top (Hungarian style: purlin below rafters)', () => {
    const m = buildStructure(base)
    const ridgePurlinTop = m.ridgePurlin.start.y + RIDGE_SIZE / 2
    // Rafter ridge end (centerline) should be above ridge purlin top
    for (const r of m.rafters) {
      expect(r.ridgeEnd.y).toBeGreaterThan(ridgePurlinTop)
    }
  })
})

describe('tie beams (KOTOGERENDA)', () => {
  it('always 2 tie beams regardless of pillar count', () => {
    expect(buildStructure({ ...base, length: 3 }).tieBeams.length).toBe(2)
    expect(buildStructure({ ...base, length: 5 }).tieBeams.length).toBe(2)
  })

  it('positioned at x=±(length/2 - PILLAR_SIZE/2) (corner pillar centers)', () => {
    const L = 4
    const m = buildStructure({ ...base, length: L })
    const xVals = m.tieBeams.map(tb => tb.start.x).sort((a, b) => a - b)
    const xPillar = L / 2 - PILLAR_SIZE / 2
    expect(xVals[0]).toBeCloseTo(-xPillar, 6)
    expect(xVals[1]).toBeCloseTo(+xPillar, 6)
  })

  it('connect purlin centers at z=±(width/2 - PURLIN_SIZE/2)', () => {
    const W = 3
    const m = buildStructure({ ...base, width: W })
    const zPurlin = W / 2 - PURLIN_SIZE / 2
    for (const tb of m.tieBeams) {
      const zVals = [tb.start.z, tb.end.z].sort((a, b) => a - b)
      expect(zVals[0]).toBeCloseTo(-zPurlin, 6)
      expect(zVals[1]).toBeCloseTo(+zPurlin, 6)
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

describe('rafters — longitudinal placement', () => {
  it('total count = 2 × (bays based on full purlin span + 1)', () => {
    const m = buildStructure(base)
    expect(m.rafters.length).toBe(2 * expectedRafterCount(base))
  })

  it('gable rafters are at x = ±(L/2 + G - RAFTER_WIDTH/2)', () => {
    const L = 4, G = 0.3
    const m = buildStructure({ ...base, length: L, gableOverhang: G })
    const n = m.rafters.length / 2
    const xVals = m.rafters.slice(0, n).map(r => r.eaveEnd.x).sort((a, b) => a - b)
    expect(xVals[0]).toBeCloseTo(-(L / 2 + G - RAFTER_WIDTH / 2), 6)
    expect(xVals[xVals.length - 1]).toBeCloseTo(+(L / 2 + G - RAFTER_WIDTH / 2), 6)
  })

  it('rafters are evenly spaced along x', () => {
    const m = buildStructure(base)
    const n = m.rafters.length / 2
    const xVals = m.rafters.slice(0, n).map(r => r.eaveEnd.x).sort((a, b) => a - b)
    const spacing = xVals[1] - xVals[0]
    for (let i = 1; i < xVals.length; i++) {
      expect(xVals[i] - xVals[i - 1]).toBeCloseTo(spacing, 6)
    }
  })

  it('spacing never exceeds MAX_RAFTER_SPACING', () => {
    const m = buildStructure(base)
    expect(m.rafterSpacing).toBeLessThanOrEqual(MAX_RAFTER_SPACING + 1e-9)
  })

  it('left and right slope rafters share x positions', () => {
    const m = buildStructure(base)
    const n = m.rafters.length / 2
    for (let i = 0; i < n; i++) {
      expect(m.rafters[i].eaveEnd.x).toBeCloseTo(m.rafters[n + i].eaveEnd.x, 6)
    }
  })
})

describe('rafters — vertical placement and slope', () => {
  it('first half is left slope (eave at z < 0), second half is right slope (eave at z > 0)', () => {
    const m = buildStructure(base)
    const n = m.rafters.length / 2
    for (let i = 0; i < n; i++)       expect(m.rafters[i].eaveEnd.z).toBeLessThan(0)
    for (let i = n; i < 2 * n; i++)   expect(m.rafters[i].eaveEnd.z).toBeGreaterThan(0)
  })

  it('all rafters meet at z=0 (ridge)', () => {
    const m = buildStructure(base)
    for (const r of m.rafters) {
      expect(r.ridgeEnd.z).toBeCloseTo(0, 6)
    }
  })

  it('eave ends at z = ±(width/2 + eavesOverhang)', () => {
    const E = 0.5, W = 3
    const m = buildStructure({ ...base, width: W, eavesOverhang: E })
    const n = m.rafters.length / 2
    expect(m.rafters[0].eaveEnd.z).toBeCloseTo(-(W / 2 + E), 6)
    expect(m.rafters[n].eaveEnd.z).toBeCloseTo(+(W / 2 + E), 6)
  })

  it('rafter centerline is above base purlin top at bearing (plumb height = 3cm)', () => {
    // At z = ±width/2, y_centerline should equal yBasePurlinTop + RAFTER_DEPTH/(2*cos(pitch)) - BIRD_MOUTH_PLUMB_HEIGHT
    const pitch = 25, W = 3, E = 0.5
    const cosPitch = Math.cos(pitch * DEG)
    const yBasePurlinTop = PILLAR_HEIGHT + PURLIN_SIZE
    const expectedY = yBasePurlinTop + RAFTER_DEPTH / (2 * cosPitch) - BIRD_MOUTH_PLUMB_HEIGHT
    const m = buildStructure({ ...base, width: W, pitch, eavesOverhang: E })
    // Rafter at base purlin (z = -W/2) for left slope:
    // y_at_base = eaveEnd.y + E * tan(pitch)
    const tanPitch = Math.tan(pitch * DEG)
    for (const r of m.rafters.slice(0, m.rafters.length / 2)) {
      const yAtBase = r.eaveEnd.y + E * tanPitch
      expect(yAtBase).toBeCloseTo(expectedY, 6)
    }
  })

  it('base bird mouth seat sits exactly at yBasePurlinTop (invariant)', () => {
    // y_centerline at z=±width/2 minus rafterYOffset must equal yBasePurlinTop
    const pitch = 25, W = 3, E = 0.5
    const cosPitch = Math.cos(pitch * DEG)
    const tanPitch = Math.tan(pitch * DEG)
    const rafterYOffset = RAFTER_DEPTH / (2 * cosPitch) - BIRD_MOUTH_PLUMB_HEIGHT
    const yBasePurlinTop = PILLAR_HEIGHT + PURLIN_SIZE
    const m = buildStructure({ ...base, width: W, pitch, eavesOverhang: E })
    for (const r of m.rafters.slice(0, m.rafters.length / 2)) {
      const yAtBase = r.eaveEnd.y + E * tanPitch
      expect(yAtBase - rafterYOffset).toBeCloseTo(yBasePurlinTop, 6)
    }
  })

  it('ridge bird mouth seat sits exactly at yRidgePurlinTop (invariant)', () => {
    // y_centerline at z=±RIDGE_SIZE/2 minus rafterYOffset must equal ridgePurlin.y + RIDGE_SIZE/2
    const pitch = 25, W = 3
    const cosPitch = Math.cos(pitch * DEG)
    const tanPitch = Math.tan(pitch * DEG)
    const rafterYOffset = RAFTER_DEPTH / (2 * cosPitch) - BIRD_MOUTH_PLUMB_HEIGHT
    const m = buildStructure({ ...base, width: W, pitch })
    const yRidgePurlinTop = m.ridgePurlin.start.y + RIDGE_SIZE / 2
    for (const r of m.rafters) {
      // At z = ±RIDGE_SIZE/2, the rafter centerline is ridgeEnd.y minus RIDGE_SIZE/2 * tan(pitch)
      const yAtPlumb = r.ridgeEnd.y - (RIDGE_SIZE / 2) * tanPitch
      expect(yAtPlumb - rafterYOffset).toBeCloseTo(yRidgePurlinTop, 6)
    }
  })

  it('rafter ridge end is above ridge purlin top', () => {
    const m = buildStructure(base)
    const ridgePurlinTop = m.ridgePurlin.start.y + RIDGE_SIZE / 2
    for (const r of m.rafters) {
      expect(r.ridgeEnd.y).toBeGreaterThan(ridgePurlinTop)
    }
  })

  it('rafter length matches distance between eaveEnd and ridgeEnd', () => {
    const m = buildStructure(base)
    for (const r of m.rafters) {
      const dy = r.ridgeEnd.y - r.eaveEnd.y
      const dz = r.ridgeEnd.z - r.eaveEnd.z
      const dist = Math.sqrt(dy * dy + dz * dz)
      expect(dist).toBeCloseTo(r.length, 6)
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

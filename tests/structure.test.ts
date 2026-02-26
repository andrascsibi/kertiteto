import { describe, it, expect } from 'vitest'
import { buildStructure, PILLAR_HEIGHT, PILLAR_SIZE, PURLIN_SIZE, RIDGE_SIZE, RAFTER_WIDTH, RAFTER_DEPTH, RIDGE_TIE_NOTCH, RIDGE_TIE_DEPTH, RIDGE_TIE_WIDTH, KNEE_BRACE_LENGTH } from '../src/model/structure'
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
  it('4 pillars for short narrow structures', () => {
    expect(buildStructure({ ...base, length: 3, width: 3 }).pillars.length).toBe(4)
  })

  it('6 pillars when one intermediate row is needed', () => {
    expect(buildStructure({ ...base, length: 5, width: 3 }).pillars.length).toBe(6)
  })

  it('scales for long structures', () => {
    expect(buildStructure({ ...base, length: 10, width: 3 }).pillars.length).toBe(8)
    expect(buildStructure({ ...base, length: 20, width: 3 }).pillars.length).toBe(14)
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
    const m = buildStructure({ ...base, length: 5, width: 3 })
    const mid = m.pillars.filter(p => Math.abs(p.base.x) < 1e-9)
    expect(mid.length).toBe(2)
    expect(mid.some(p => p.base.z < 0)).toBe(true)
    expect(mid.some(p => p.base.z > 0)).toBe(true)
  })

  it('no center pillars when tie beam span <= MAX_UNSUPPORTED_SPAN', () => {
    const W = MAX_UNSUPPORTED_SPAN + 2 * PILLAR_SIZE  // inner span exactly at limit
    const m = buildStructure({ ...base, width: W, length: 3 })
    const centerPillars = m.pillars.filter(p => Math.abs(p.base.z) < 1e-9)
    expect(centerPillars.length).toBe(0)
  })

  it('center pillars at z=0 for corner rows when width > MAX_UNSUPPORTED_SPAN + 2*PILLAR_SIZE', () => {
    const W = MAX_UNSUPPORTED_SPAN + 2 * PILLAR_SIZE + 0.01
    const m = buildStructure({ ...base, width: W, length: 3 })
    const centerPillars = m.pillars.filter(p => Math.abs(p.base.z) < 1e-9)
    // 2 rows (corners) × 1 center pillar each = 2
    expect(centerPillars.length).toBe(2)
  })

  it('center pillars only at corner rows, not intermediate rows', () => {
    const W = MAX_UNSUPPORTED_SPAN + 2 * PILLAR_SIZE + 0.01
    const m = buildStructure({ ...base, width: W, length: 5 })  // 3 rows
    const centerPillars = m.pillars.filter(p => Math.abs(p.base.z) < 1e-9)
    // Only 2 corner rows get center pillars, not the middle row
    expect(centerPillars.length).toBe(2)
    const cornerX = 5 / 2 - PILLAR_SIZE / 2
    for (const cp of centerPillars) {
      expect(Math.abs(Math.abs(cp.base.x) - cornerX)).toBeLessThan(1e-9)
    }
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
  it('one tie beam per pillar row', () => {
    // 4 pillars = 2 rows → 2 tie beams
    expect(buildStructure({ ...base, length: 3 }).tieBeams.length).toBe(2)
    // 6 pillars = 3 rows → 3 tie beams
    expect(buildStructure({ ...base, length: 5 }).tieBeams.length).toBe(3)
    // 8 pillars = 4 rows → 4 tie beams
    expect(buildStructure({ ...base, length: 10 }).tieBeams.length).toBe(4)
  })

  it('x-positions match pillar row x-positions', () => {
    const m = buildStructure({ ...base, length: 5 })
    const pillarXs = [...new Set(m.pillars.map(p => p.base.x))].sort((a, b) => a - b)
    const tieBeamXs = m.tieBeams.map(tb => tb.start.x).sort((a, b) => a - b)
    expect(tieBeamXs.length).toBe(pillarXs.length)
    for (let i = 0; i < pillarXs.length; i++) {
      expect(tieBeamXs[i]).toBeCloseTo(pillarXs[i], 6)
    }
  })

  it('corner tie beams at x=±(length/2 - PILLAR_SIZE/2)', () => {
    const L = 4
    const m = buildStructure({ ...base, length: L })
    const xVals = m.tieBeams.map(tb => tb.start.x).sort((a, b) => a - b)
    const xPillar = L / 2 - PILLAR_SIZE / 2
    expect(xVals[0]).toBeCloseTo(-xPillar, 6)
    expect(xVals[xVals.length - 1]).toBeCloseTo(+xPillar, 6)
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

describe('ridge ties (KAKASULO)', () => {
  it('count = 2 * nRafters - 2 (pairs per interior rafter, singles at gable ends)', () => {
    const m = buildStructure(base)
    const raftersPerSlope = m.rafters.length / 2
    expect(m.ridgeTies.length).toBe(2 * raftersPerSlope - 2)
  })

  it('count scales with length', () => {
    expect(buildStructure({ ...base, length: 3 }).ridgeTies.length).toBeGreaterThanOrEqual(2)
    expect(buildStructure({ ...base, length: 10 }).ridgeTies.length).toBeGreaterThan(
      buildStructure({ ...base, length: 3 }).ridgeTies.length
    )
  })

  it('gable rafters get single tie on inner side, interior rafters get pairs', () => {
    const m = buildStructure(base)
    const raftersPerSlope = m.rafters.length / 2
    const xOffset = RAFTER_WIDTH / 2 + RIDGE_TIE_WIDTH / 2
    const rafterXs = m.rafters.slice(0, raftersPerSlope).map(r => r.eaveEnd.x)
    const tieXs = m.ridgeTies.map(rt => rt.x).sort((a, b) => a - b)

    // First gable rafter: single tie on +x (inner) side
    expect(tieXs[0]).toBeCloseTo(rafterXs[0] + xOffset, 6)
    // Last gable rafter: single tie on -x (inner) side
    expect(tieXs[tieXs.length - 1]).toBeCloseTo(rafterXs[raftersPerSlope - 1] - xOffset, 6)

    // Interior rafters: two ties each, offset ±xOffset
    for (let i = 1; i < raftersPerSlope - 1; i++) {
      expect(tieXs).toEqual(
        expect.arrayContaining([
          expect.closeTo(rafterXs[i] - xOffset, 6),
          expect.closeTo(rafterXs[i] + xOffset, 6),
        ])
      )
    }
  })

  it('yTop = yRidgePurlinTop - RIDGE_SIZE + RIDGE_TIE_NOTCH', () => {
    const m = buildStructure(base)
    const yRidgePurlinTop = m.ridgePurlin.start.y + RIDGE_SIZE / 2
    const expectedYTop = yRidgePurlinTop - RIDGE_SIZE + RIDGE_TIE_NOTCH
    for (const rt of m.ridgeTies) {
      expect(rt.yTop).toBeCloseTo(expectedYTop, 6)
    }
  })

  it('yBottom = yTop - RIDGE_TIE_DEPTH', () => {
    const m = buildStructure(base)
    for (const rt of m.ridgeTies) {
      expect(rt.yBottom).toBeCloseTo(rt.yTop - RIDGE_TIE_DEPTH, 6)
    }
  })

  it('zHalfBottom > zHalfTop (trapezoid widens downward)', () => {
    const m = buildStructure(base)
    for (const rt of m.ridgeTies) {
      expect(rt.zHalfBottom).toBeGreaterThan(rt.zHalfTop)
    }
  })

  it('sides are flush with rafter top face (geometric invariant)', () => {
    // The rafter top face at the ridge: yRafterTop = yRafterAtRidge + RAFTER_DEPTH/(2*cos(pitch))
    // At any z from ridge, rafter top y = yRafterTop - |z| * tan(pitch)
    // Ridge tie side at yTop:  z = (yRafterTop - yTop) / tan(pitch) = zHalfTop
    // Ridge tie side at yBottom: z = (yRafterTop - yBottom) / tan(pitch) = zHalfBottom
    const pitch = 25
    const m = buildStructure({ ...base, pitch })
    const cosPitch = Math.cos(pitch * DEG)
    const tanPitch = Math.tan(pitch * DEG)
    const yRafterAtRidge = m.rafters[0].ridgeEnd.y
    const yRafterTop = yRafterAtRidge + RAFTER_DEPTH / (2 * cosPitch)
    for (const rt of m.ridgeTies) {
      expect(rt.zHalfTop).toBeCloseTo((yRafterTop - rt.yTop) / tanPitch, 6)
      expect(rt.zHalfBottom).toBeCloseTo((yRafterTop - rt.yBottom) / tanPitch, 6)
    }
  })

  it('works across different pitch angles', () => {
    for (const pitch of [15, 25, 35, 45]) {
      const m = buildStructure({ ...base, pitch })
      expect(m.ridgeTies.length).toBeGreaterThanOrEqual(2)
      for (const rt of m.ridgeTies) {
        expect(rt.zHalfTop).toBeGreaterThan(0)
        expect(rt.zHalfBottom).toBeGreaterThan(rt.zHalfTop)
        expect(rt.yBottom).toBeLessThan(rt.yTop)
      }
    }
  })
})

describe('corner knee braces (KONYOKFA)', () => {
  const leg = KNEE_BRACE_LENGTH * Math.cos(Math.PI / 4)

  function dist(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2)
  }

  it('22 braces for default config (4 corners × 3 + 1 interior row × 2 sides × 5)', () => {
    const m = buildStructure(base)
    // 3 pillar rows for length=4: 2 corner + 1 interior
    // Corner: 2 rows × 2 z-positions × 3 = 12
    // Interior side: 1 row × 2 z-positions × 5 = 10
    expect(m.kneeBraces.length).toBe(22)
  })

  it('32 braces for longer buildings (more interior rows)', () => {
    const m = buildStructure({ ...base, length: 10 })
    // 4 pillar rows for length=10: 2 corner + 2 interior
    // Corner: 12, Interior: 2 × 2 × 5 = 20
    expect(m.kneeBraces.length).toBe(32)
  })

  it('all braces have length ≈ 1.0 m', () => {
    const m = buildStructure(base)
    for (const kb of m.kneeBraces) {
      expect(dist(kb.start, kb.end)).toBeCloseTo(KNEE_BRACE_LENGTH, 6)
    }
  })

  it('vertical braces are at 45° (|deltaY| ≈ leg)', () => {
    const m = buildStructure(base)
    const verticalBraces = m.kneeBraces.filter(kb =>
      Math.abs(kb.end.y - kb.start.y) > 0.01
    )
    // Corner: 4 corners × 2 = 8, Interior: 1 row × 2 sides × 3 = 6 → total 14
    expect(verticalBraces.length).toBe(14)
    for (const kb of verticalBraces) {
      expect(Math.abs(kb.end.y - kb.start.y)).toBeCloseTo(leg, 6)
    }
  })

  it('horizontal braces are at 45° in XZ plane (|deltaX| ≈ |deltaZ| ≈ leg)', () => {
    const m = buildStructure(base)
    const horizBraces = m.kneeBraces.filter(kb =>
      Math.abs(kb.end.y - kb.start.y) < 0.01
    )
    // Corner: 4, Interior: 1 row × 2 sides × 2 = 4 → total 8
    expect(horizBraces.length).toBe(8)
    for (const kb of horizBraces) {
      expect(Math.abs(kb.end.x - kb.start.x)).toBeCloseTo(leg, 6)
      expect(Math.abs(kb.end.z - kb.start.z)).toBeCloseTo(leg, 6)
    }
  })

  it('all braces point inward (toward building center)', () => {
    const m = buildStructure(base)
    for (const kb of m.kneeBraces) {
      const midX = (kb.start.x + kb.end.x) / 2
      const midZ = (kb.start.z + kb.end.z) / 2
      // Midpoint should be closer to center than the outermost endpoint
      const startDistSq = kb.start.x ** 2 + kb.start.z ** 2
      const endDistSq = kb.end.x ** 2 + kb.end.z ** 2
      const midDistSq = midX ** 2 + midZ ** 2
      expect(midDistSq).toBeLessThan(Math.max(startDistSq, endDistSq) + 1e-9)
    }
  })

  it('vertical brace lower ends are at y = yJunction - leg', () => {
    const yJunction = PILLAR_HEIGHT + PURLIN_SIZE / 2
    const m = buildStructure(base)
    const verticalBraces = m.kneeBraces.filter(kb =>
      Math.abs(kb.end.y - kb.start.y) > 0.01
    )
    for (const kb of verticalBraces) {
      const lowerY = Math.min(kb.start.y, kb.end.y)
      expect(lowerY).toBeCloseTo(yJunction - leg, 6)
    }
  })

  it('upper ends of vertical braces are at y = yJunction (purlin center level)', () => {
    const yJunction = PILLAR_HEIGHT + PURLIN_SIZE / 2
    const m = buildStructure(base)
    const verticalBraces = m.kneeBraces.filter(kb =>
      Math.abs(kb.end.y - kb.start.y) > 0.01
    )
    for (const kb of verticalBraces) {
      const upperY = Math.max(kb.start.y, kb.end.y)
      expect(upperY).toBeCloseTo(yJunction, 6)
    }
  })

  it('wide building: ridge pillar braces (5 per ridge pillar)', () => {
    const m = buildStructure({ ...base, width: 5 })
    // Width 5: innerSpan = 4.7 > 3.5 → center pillars at corner rows
    // 3 pillar rows (length=4): 2 corner + 1 interior
    // Corner side: 2×2×3=12, Interior side: 1×2×5=10
    // Ridge pillar: 2×5=10, Mid purlin crossing: 1×4=4
    expect(m.kneeBraces.length).toBe(36)
  })

  it('wide building: all braces have length ≈ 1.0 m', () => {
    const m = buildStructure({ ...base, width: 5 })
    for (const kb of m.kneeBraces) {
      expect(dist(kb.start, kb.end)).toBeCloseTo(KNEE_BRACE_LENGTH, 6)
    }
  })

  it('wide building: mid purlin ↔ tie beam crossings at interior rows are all horizontal', () => {
    const m = buildStructure({ ...base, width: 5 })
    // Find horizontal braces at z ≈ 0 (one endpoint) on interior rows
    const horizAtZ0 = m.kneeBraces.filter(kb =>
      Math.abs(kb.start.y - kb.end.y) < 0.001 &&
      (Math.abs(kb.start.z) < 0.01 || Math.abs(kb.end.z) < 0.01)
    )
    // Corner rows: 2 horizontal purlin↔tiebeam per ridge pillar × 2 rows = 4
    // Plus 2 horizontal side corner braces × 2 rows... no, those aren't at z≈0
    // Interior row: 4 horizontal at z=0 crossing
    // Total horizontal touching z≈0: ridge pillar 4 + interior 4 = 8
    expect(horizAtZ0.length).toBeGreaterThanOrEqual(4)
    for (const kb of horizAtZ0) {
      expect(kb.start.y).toBeCloseTo(kb.end.y, 6)
    }
  })
})

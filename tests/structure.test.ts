import { describe, it, expect } from 'vitest'
import { buildStructure, computeMetrics, GROUND_SCREW_HEIGHT, PILLAR_HEIGHT, PILLAR_SIZE, PURLIN_SIZE, RIDGE_SIZE, RAFTER_WIDTH, RAFTER_DEPTH, RIDGE_TIE_NOTCH, RIDGE_TIE_DEPTH, RIDGE_TIE_WIDTH, KNEE_BRACE_LENGTH, RIDGE_KNEE_BRACE_LENGTH } from '../src/model/structure'
import { ridgeHeight, BIRD_MOUTH_PLUMB_HEIGHT, MAX_RAFTER_SPACING, MAX_UNSUPPORTED_TIE_BEAM_SPAN } from '../src/model/geometry'
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

  it('no center pillars when tie beam span <= MAX_UNSUPPORTED_TIE_BEAM_SPAN', () => {
    const W = MAX_UNSUPPORTED_TIE_BEAM_SPAN + 2 * PILLAR_SIZE  // inner span exactly at limit
    const m = buildStructure({ ...base, width: W, length: 3 })
    const centerPillars = m.pillars.filter(p => Math.abs(p.base.z) < 1e-9)
    expect(centerPillars.length).toBe(0)
  })

  it('center pillars at z=0 for corner rows when width > MAX_UNSUPPORTED_TIE_BEAM_SPAN + 2*PILLAR_SIZE', () => {
    const W = MAX_UNSUPPORTED_TIE_BEAM_SPAN + 2 * PILLAR_SIZE + 0.01
    const m = buildStructure({ ...base, width: W, length: 3 })
    const centerPillars = m.pillars.filter(p => Math.abs(p.base.z) < 1e-9)
    // 2 rows (corners) × 1 center pillar each = 2
    expect(centerPillars.length).toBe(2)
  })

  it('center pillars only at corner rows, not intermediate rows', () => {
    const W = MAX_UNSUPPORTED_TIE_BEAM_SPAN + 2 * PILLAR_SIZE + 0.01
    const m = buildStructure({ ...base, width: W, length: 5 })  // 3 rows
    const centerPillars = m.pillars.filter(p => Math.abs(p.base.z) < 1e-9)
    // Only 2 corner rows get center pillars, not the middle row
    expect(centerPillars.length).toBe(2)
    const cornerX = 5 / 2 - PILLAR_SIZE / 2
    for (const cp of centerPillars) {
      expect(Math.abs(Math.abs(cp.base.x) - cornerX)).toBeLessThan(1e-9)
    }
  })

  it('all pillars base at y=GROUND_SCREW_HEIGHT with correct height', () => {
    const m = buildStructure(base)
    for (const p of m.pillars) {
      expect(p.base.y).toBe(GROUND_SCREW_HEIGHT)
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
    const expectedY = GROUND_SCREW_HEIGHT + PILLAR_HEIGHT + PURLIN_SIZE / 2
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
    const yBasePurlinTop = GROUND_SCREW_HEIGHT + PILLAR_HEIGHT + PURLIN_SIZE
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
    const expectedY = GROUND_SCREW_HEIGHT + PILLAR_HEIGHT + PURLIN_SIZE / 2
    for (const tb of m.tieBeams) {
      expect(tb.start.y).toBeCloseTo(expectedY, 6)
    }
  })
})

describe('rafters — longitudinal placement', () => {
  it('2 pillar rows: no main rafters, equidistant gable-to-gable', () => {
    const m = buildStructure({ ...base, length: 2 })
    const n = m.rafters.length / 2
    const leftRafters = m.rafters.slice(0, n)
    expect(leftRafters.filter(r => r.type === 'main').length).toBe(0)
    expect(leftRafters.filter(r => r.type === 'gable').length).toBe(2)
  })

  it('3 pillar rows: main rafter only at interior (middle) pillar', () => {
    const m = buildStructure(base) // length=3.3 → 3 pillar rows
    const n = m.rafters.length / 2
    const leftRafters = m.rafters.slice(0, n)
    const mainRafters = leftRafters.filter(r => r.type === 'main')
    expect(mainRafters.length).toBe(1)
    expect(mainRafters[0].eaveEnd.x).toBeCloseTo(0, 6) // middle pillar at x=0
  })

  it('4+ pillar rows: main rafters at all pillar positions', () => {
    const m = buildStructure({ ...base, length: 10 })
    const n = m.rafters.length / 2
    const leftRafters = m.rafters.slice(0, n)
    const mainXs = leftRafters.filter(r => r.type === 'main').map(r => r.eaveEnd.x)
    const pillarXs = [...new Set(m.pillars.map(p => p.base.x))].sort((a, b) => a - b)
    expect(mainXs.length).toBe(pillarXs.length)
    for (let i = 0; i < pillarXs.length; i++) {
      expect(mainXs[i]).toBeCloseTo(pillarXs[i], 6)
    }
  })

  it('gable rafters are at x = ±(L/2 + G - RAFTER_WIDTH/2)', () => {
    const L = 4, G = 0.3
    const m = buildStructure({ ...base, length: L, gableOverhang: G })
    const n = m.rafters.length / 2
    const leftRafters = m.rafters.slice(0, n)
    const gableRafters = leftRafters.filter(r => r.type === 'gable')
    expect(gableRafters.length).toBe(2)
    const xVals = gableRafters.map(r => r.eaveEnd.x).sort((a, b) => a - b)
    expect(xVals[0]).toBeCloseTo(-(L / 2 + G - RAFTER_WIDTH / 2), 6)
    expect(xVals[1]).toBeCloseTo(+(L / 2 + G - RAFTER_WIDTH / 2), 6)
  })

  it('spacing never exceeds MAX_RAFTER_SPACING', () => {
    const m = buildStructure(base)
    const n = m.rafters.length / 2
    const xVals = m.rafters.slice(0, n).map(r => r.eaveEnd.x).sort((a, b) => a - b)
    for (let i = 1; i < xVals.length; i++) {
      expect(xVals[i] - xVals[i - 1]).toBeLessThanOrEqual(MAX_RAFTER_SPACING + 1e-9)
    }
  })

  it('fill rafters are evenly spaced within each segment', () => {
    const m = buildStructure({ ...base, length: 10 })
    const n = m.rafters.length / 2
    const leftRafters = m.rafters.slice(0, n)
    // Find anchor positions (gable + main)
    const anchors = leftRafters.filter(r => r.type !== 'regular').map(r => r.eaveEnd.x)
    // For each segment between anchors, check fill rafters are evenly spaced
    for (let s = 0; s < anchors.length - 1; s++) {
      const xA = anchors[s], xB = anchors[s + 1]
      const fills = leftRafters.filter(r => r.type === 'regular' && r.eaveEnd.x > xA + 1e-9 && r.eaveEnd.x < xB - 1e-9)
      if (fills.length === 0) continue
      const allXs = [xA, ...fills.map(r => r.eaveEnd.x), xB]
      const step = allXs[1] - allXs[0]
      for (let i = 1; i < allXs.length; i++) {
        expect(allXs[i] - allXs[i - 1]).toBeCloseTo(step, 6)
      }
    }
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
    const yBasePurlinTop = GROUND_SCREW_HEIGHT + PILLAR_HEIGHT + PURLIN_SIZE
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
    const yBasePurlinTop = GROUND_SCREW_HEIGHT + PILLAR_HEIGHT + PURLIN_SIZE
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

  it('22 braces for default config (no king posts at default width)', () => {
    const m = buildStructure(base)
    // 3 pillar rows for length=4: 2 corner + 1 interior
    // Corner: 2 rows × 2 z-positions × 3 = 12
    // Interior side: 1 row × 2 z-positions × 5 = 10
    // No king posts (width=3, needsCenterPillars=false)
    expect(m.kneeBraces.length).toBe(22)
  })

  it('32 braces for longer buildings (no king posts at default width)', () => {
    const m = buildStructure({ ...base, length: 10 })
    // 4 pillar rows for length=10: 2 corner + 2 interior
    // Corner: 12, Interior: 2 × 2 × 5 = 20
    // No king posts (width=3, needsCenterPillars=false)
    expect(m.kneeBraces.length).toBe(32)
  })

  it('all braces have length ≈ KNEE_BRACE_LENGTH or RIDGE_KNEE_BRACE_LENGTH', () => {
    const m = buildStructure(base)
    for (const kb of m.kneeBraces) {
      const len = dist(kb.start, kb.end)
      const isStandard = Math.abs(len - KNEE_BRACE_LENGTH) < 1e-6
      const isRidge = Math.abs(len - RIDGE_KNEE_BRACE_LENGTH) < 1e-6
      expect(isStandard || isRidge).toBe(true)
    }
  })

  it('vertical braces are at 45° (|deltaY| ≈ leg)', () => {
    const m = buildStructure(base)
    const ridgeLeg = RIDGE_KNEE_BRACE_LENGTH * Math.cos(Math.PI / 4)
    const verticalBraces = m.kneeBraces.filter(kb =>
      Math.abs(kb.end.y - kb.start.y) > 0.01
    )
    // Corner: 4 corners × 2 = 8, Interior: 1 row × 2 sides × 3 = 6 → total 14
    // No king post braces (default width, needsCenterPillars=false)
    expect(verticalBraces.length).toBe(14)
    for (const kb of verticalBraces) {
      const dy = Math.abs(kb.end.y - kb.start.y)
      const isStandard = Math.abs(dy - leg) < 1e-6
      const isRidge = Math.abs(dy - ridgeLeg) < 1e-6
      expect(isStandard || isRidge).toBe(true)
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

  it('vertical brace lower ends are at y = junction - leg', () => {
    const ridgeLeg = RIDGE_KNEE_BRACE_LENGTH * Math.cos(Math.PI / 4)
    const m = buildStructure(base)
    const verticalBraces = m.kneeBraces.filter(kb =>
      Math.abs(kb.end.y - kb.start.y) > 0.01
    )
    // Side braces meet at base purlin level, king post braces meet at ridge purlin level
    const yRidgePurlinCenter = m.ridgePurlin.start.y
    for (const kb of verticalBraces) {
      const upperY = Math.max(kb.start.y, kb.end.y)
      const lowerY = Math.min(kb.start.y, kb.end.y)
      const isRidgeBrace = Math.abs(upperY - yRidgePurlinCenter) < 0.01
      const expectedLeg = isRidgeBrace ? ridgeLeg : leg
      expect(lowerY).toBeCloseTo(upperY - expectedLeg, 6)
    }
  })

  it('upper ends of vertical braces are at y = junction level', () => {
    const yJunction = GROUND_SCREW_HEIGHT + PILLAR_HEIGHT + PURLIN_SIZE / 2
    const m = buildStructure(base)
    const verticalBraces = m.kneeBraces.filter(kb =>
      Math.abs(kb.end.y - kb.start.y) > 0.01
    )
    const yRidgePurlinCenter = m.ridgePurlin.start.y
    for (const kb of verticalBraces) {
      const upperY = Math.max(kb.start.y, kb.end.y)
      const isAtBasePurlin = Math.abs(upperY - yJunction) < 0.01
      const isAtRidgePurlin = Math.abs(upperY - yRidgePurlinCenter) < 0.01
      expect(isAtBasePurlin || isAtRidgePurlin).toBe(true)
    }
  })

  it('wide building: center pillar braces (no center purlin)', () => {
    const m = buildStructure({ ...base, width: 5 })
    // Width 5: innerSpan = 4.7 > 4.0 → center pillars + king posts at interior rows
    // 3 pillar rows (length=4): 2 corner + 1 interior
    // Corner side: 2×2×3=12, Interior side: 1×2×5=10
    // Center pillar→tie beam (YZ): 2 corner rows × 2 = 4
    // King post→ridge: 1 interior × 2 = 2, Center pillar→ridge: 2 corner × 1 = 2
    // King braces (king post→main rafter at 45°): 1 main pillar × 2 sides = 2
    expect(m.kneeBraces.length).toBe(32)
  })

  it('wide building: all braces have length ≈ KNEE_BRACE_LENGTH, RIDGE_KNEE_BRACE_LENGTH, or are king braces at 45°', () => {
    const m = buildStructure({ ...base, width: 5 })
    for (const kb of m.kneeBraces) {
      const dx = kb.end.x - kb.start.x, dy = kb.end.y - kb.start.y, dz = kb.end.z - kb.start.z
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz)
      const isStandard = Math.abs(len - KNEE_BRACE_LENGTH) < 1e-6
      const isRidge = Math.abs(len - RIDGE_KNEE_BRACE_LENGTH) < 1e-6
      // King braces: x=const plane, 45° (dy ≈ |dz|), variable length
      const isKingBrace = Math.abs(dx) < 1e-9 && Math.abs(Math.abs(dy) - Math.abs(dz)) < 1e-6 && len > 0.1
      expect(isStandard || isRidge || isKingBrace).toBe(true)
    }
  })

  it('wide building: no center purlin braces, only pillar↔tie beam and king braces at z=0', () => {
    const m = buildStructure({ ...base, width: 5 })
    const bracesAtZ0 = m.kneeBraces.filter(kb =>
      Math.abs(kb.start.z) < 0.01 || Math.abs(kb.end.z) < 0.01
    )
    // Corner rows: 2 rows × 2 pillar↔tie beam (YZ) = 4
    // King post→ridge: 1 interior × 2 = 2, center pillar→ridge: 2 corner × 1 = 2
    // King braces start at z=0: 1 main pillar × 2 sides = 2
    expect(bracesAtZ0.length).toBe(10)
  })
})

// ── Derived metrics ──────────────────────────────────────────────────────────

describe('computeMetrics', () => {
  it('totalFootprint = (width + 2*eaves) × (length + 2*gable)', () => {
    const m = buildStructure(base)
    const metrics = computeMetrics(m)
    const expected = (base.width + 2 * base.eavesOverhang) * (base.length + 2 * base.gableOverhang)
    expect(metrics.totalFootprint).toBeCloseTo(expected, 6)
  })

  it('totalFootprint changes with overhangs', () => {
    const m1 = buildStructure(base)
    const m2 = buildStructure({ ...base, eavesOverhang: 0.8, gableOverhang: 0.5 })
    const met1 = computeMetrics(m1)
    const met2 = computeMetrics(m2)
    expect(met2.totalFootprint).toBeGreaterThan(met1.totalFootprint)
  })

  it('roofSurface is positive', () => {
    const metrics = computeMetrics(buildStructure(base))
    expect(metrics.roofSurface).toBeGreaterThan(0)
  })

  it('timberVolume is positive', () => {
    const metrics = computeMetrics(buildStructure(base))
    expect(metrics.timberVolume).toBeGreaterThan(0)
  })
})

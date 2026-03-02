import { describe, it, expect } from 'vitest'
import { buildRoofing, counterBattenTotalLength, roofBattenTotalLength, flashingTotalSurface, ROOF_BATTEN_DISTANCE, FLASHING_LENGTH, FLASHING_OVERLAP, FLASHING_DEVELOPED_WIDTH, LAMBERIA_WIDTH, SHEET_LENGTH } from '../src/model/roofing'
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

  it('last plank width is remainder of rafter length', () => {
    const roofing = buildRoofing(structure, { ...opts, lamberia: true })
    const n = roofing.lamberia!.planksPerSlope
    const expected = rafterLen - (n - 1) * LAMBERIA_WIDTH
    expect(roofing.lamberia!.lastPlankWidth).toBeCloseTo(expected, 6)
    expect(roofing.lamberia!.lastPlankWidth).toBeLessThanOrEqual(LAMBERIA_WIDTH)
    expect(roofing.lamberia!.lastPlankWidth).toBeGreaterThan(0)
  })
})

describe('metal sheets', () => {
  const structure = buildStructure(base)
  const totalLength = base.length + 2 * base.gableOverhang  // 4.6
  const rafterLen = structure.rafters[0].length

  it('no metal sheets when roofing disabled', () => {
    const roofing = buildRoofing(structure, { ...opts, roofing: false })
    expect(roofing.metalSheets).toBeNull()
  })

  it('correct number of sheets per slope', () => {
    const roofing = buildRoofing(structure, { ...opts, roofing: true })
    const expected = Math.ceil(totalLength / SHEET_LENGTH)
    expect(roofing.metalSheets!.sheetsPerSlope).toBe(expected)
  })

  it('sheets array has correct count', () => {
    const roofing = buildRoofing(structure, { ...opts, roofing: true })
    expect(roofing.metalSheets!.sheets.length).toBe(roofing.metalSheets!.sheetsPerSlope)
  })

  it('gable sheets are equal width and centered', () => {
    const roofing = buildRoofing(structure, { ...opts, roofing: true })
    const ms = roofing.metalSheets!
    if (ms.sheetsPerSlope === 1) return // single sheet covers everything
    const first = ms.sheets[0]
    const last = ms.sheets[ms.sheets.length - 1]
    // Gable sheets have equal width
    expect(first.width).toBeCloseTo(last.width, 6)
    // Gable sheets are symmetric around x=0
    expect(first.x).toBeCloseTo(-last.x, 6)
    // Gable sheet width <= SHEET_LENGTH
    expect(first.width).toBeLessThanOrEqual(SHEET_LENGTH + 1e-9)
    expect(first.width).toBeGreaterThan(0)
  })

  it('inner sheets are full SHEET_LENGTH width', () => {
    const roofing = buildRoofing(structure, { ...opts, roofing: true })
    const ms = roofing.metalSheets!
    if (ms.sheetsPerSlope <= 2) return // no inner sheets
    for (let i = 1; i < ms.sheets.length - 1; i++) {
      expect(ms.sheets[i].width).toBeCloseTo(SHEET_LENGTH, 6)
    }
  })

  it('total sheet widths sum to totalLength', () => {
    const roofing = buildRoofing(structure, { ...opts, roofing: true })
    const ms = roofing.metalSheets!
    const sum = ms.sheets.reduce((s, sh) => s + sh.width, 0)
    expect(sum).toBeCloseTo(totalLength, 6)
  })

  it('slopeLength equals rafter length', () => {
    const roofing = buildRoofing(structure, { ...opts, roofing: true })
    expect(roofing.metalSheets!.slopeLength).toBeCloseTo(rafterLen, 6)
  })

  it('correct number of korc positions (sheetsPerSlope - 1)', () => {
    const roofing = buildRoofing(structure, { ...opts, roofing: true })
    const ms = roofing.metalSheets!
    expect(ms.korcXPositions.length).toBe(ms.sheetsPerSlope - 1)
  })

  it('korc positions are at sheet junctions', () => {
    const roofing = buildRoofing(structure, { ...opts, roofing: true })
    const ms = roofing.metalSheets!
    for (let i = 0; i < ms.korcXPositions.length; i++) {
      // Korc at right edge of sheet i = left edge of sheet i+1
      const rightEdge = ms.sheets[i].x + ms.sheets[i].width / 2
      const leftEdge = ms.sheets[i + 1].x - ms.sheets[i + 1].width / 2
      expect(ms.korcXPositions[i]).toBeCloseTo(rightEdge, 6)
      expect(ms.korcXPositions[i]).toBeCloseTo(leftEdge, 6)
    }
  })
})

describe('drip edge', () => {
  const structure = buildStructure(base)
  const totalLength = base.length + 2 * base.gableOverhang

  it('no drip edge when membrane disabled', () => {
    const roofing = buildRoofing(structure, { ...opts, membrane: false })
    expect(roofing.dripEdge).toBeNull()
  })

  it('drip edge present when membrane enabled', () => {
    const roofing = buildRoofing(structure, { ...opts, membrane: true })
    expect(roofing.dripEdge).not.toBeNull()
  })

  it('length equals totalLength', () => {
    const roofing = buildRoofing(structure, { ...opts, membrane: true })
    expect(roofing.dripEdge!.length).toBeCloseTo(totalLength, 6)
  })
})

describe('eaves flashing', () => {
  const structure = buildStructure(base)
  const totalLength = base.length + 2 * base.gableOverhang

  it('no eaves flashing when roofing disabled', () => {
    const roofing = buildRoofing(structure, { ...opts, roofing: false })
    expect(roofing.eavesFlashing).toBeNull()
  })

  it('eaves flashing present when roofing enabled', () => {
    const roofing = buildRoofing(structure, { ...opts, roofing: true })
    expect(roofing.eavesFlashing).not.toBeNull()
  })

  it('length equals totalLength', () => {
    const roofing = buildRoofing(structure, { ...opts, roofing: true })
    expect(roofing.eavesFlashing!.length).toBeCloseTo(totalLength, 6)
  })
})

describe('gable flashing', () => {
  const structure = buildStructure(base)
  const totalLength = base.length + 2 * base.gableOverhang

  it('no gable flashing when roofing disabled', () => {
    const roofing = buildRoofing(structure, { ...opts, roofing: false })
    expect(roofing.gableFlashing).toBeNull()
  })

  it('gable flashing present when roofing enabled', () => {
    const roofing = buildRoofing(structure, { ...opts, roofing: true })
    expect(roofing.gableFlashing).not.toBeNull()
  })

  it('halfLength equals totalLength / 2', () => {
    const roofing = buildRoofing(structure, { ...opts, roofing: true })
    expect(roofing.gableFlashing!.halfLength).toBeCloseTo(totalLength / 2, 6)
  })
})

describe('ridge flashing', () => {
  const structure = buildStructure(base)
  const totalLength = base.length + 2 * base.gableOverhang

  it('no ridge flashing when roofing disabled', () => {
    const roofing = buildRoofing(structure, { ...opts, roofing: false })
    expect(roofing.ridgeFlashing).toBeNull()
  })

  it('ridge flashing present when roofing enabled', () => {
    const roofing = buildRoofing(structure, { ...opts, roofing: true })
    expect(roofing.ridgeFlashing).not.toBeNull()
  })

  it('length equals totalLength', () => {
    const roofing = buildRoofing(structure, { ...opts, roofing: true })
    expect(roofing.ridgeFlashing!.length).toBeCloseTo(totalLength, 6)
  })
})

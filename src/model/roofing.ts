import type { StructureModel } from './types'

export const ROOF_BATTEN_DISTANCE = 0.2 // meters between roof battens

// Developed width — flat-laid width of each flashing profile (m)
export const FLASHING_DEVELOPED_WIDTH = {
  dripEdge:      0.125,  // 125 mm
  eavesFlashing: 0.250,  // 250 mm
  ridgeFlashing: 0.540,  // 540 mm
  gableFlashing: 0.312,  // 312 mm
}
export const FLASHING_LENGTH  = 2    // meters per piece
export const FLASHING_OVERLAP = 0.1  // meters overlap between pieces

export interface CounterBatten {
  /** Length along slope, same as corresponding rafter (m) */
  length: number
}

export interface RoofBatten {
  /** Length of one batten row (longitudinal span of building) (m) */
  length: number
}

export interface FlashingGroup {
  count: number    // number of 2m pieces
  surface: number  // m² (count × FLASHING_LENGTH × developedWidth)
}

export interface Flashings {
  dripEdge: FlashingGroup
  eavesFlashing: FlashingGroup
  ridgeFlashing: FlashingGroup
  gableFlashing: FlashingGroup
  totalSurface: number
}

export interface RoofingModel {
  counterBattens: CounterBatten[]
  roofBattens: RoofBatten[]
  flashings: Flashings | null
}

export interface RoofingOptions {
  membrane: boolean
  roofing: boolean
}

export function buildRoofing(structure: StructureModel, options: RoofingOptions): RoofingModel {
  const counterBattens: CounterBatten[] = []
  if (options.membrane) {
    for (const rafter of structure.rafters) {
      counterBattens.push({ length: rafter.length })
    }
  }

  const roofBattens: RoofBatten[] = []
  if (options.roofing) {
    const rafterLen = structure.rafters[0].length
    const rowsPerSlope = Math.ceil(rafterLen / ROOF_BATTEN_DISTANCE) + 1 + 1 // +1 fence-post, +1 ridge
    const totalRows = rowsPerSlope * 2
    const battenLength = structure.totalLength
    for (let i = 0; i < totalRows; i++) {
      roofBattens.push({ length: battenLength })
    }
  }

  let flashings: Flashings | null = null
  if (options.roofing) {
    const totalLength = structure.totalLength
    const effectiveLen = FLASHING_LENGTH - FLASHING_OVERLAP

    const eavesRun = totalLength * 2
    const eavesCount = Math.ceil(eavesRun / effectiveLen)

    const ridgeRun = totalLength
    const ridgeCount = Math.ceil(ridgeRun / effectiveLen)

    const rafterLen = structure.rafters[0].length
    const gableRun = rafterLen * 4
    const gableCount = Math.ceil(gableRun / effectiveLen)

    const group = (count: number, devWidth: number): FlashingGroup => ({
      count,
      surface: count * FLASHING_LENGTH * devWidth,
    })

    const dripEdge = group(eavesCount, FLASHING_DEVELOPED_WIDTH.dripEdge)
    const eavesFlashing = group(eavesCount, FLASHING_DEVELOPED_WIDTH.eavesFlashing)
    const ridgeFlashing = group(ridgeCount, FLASHING_DEVELOPED_WIDTH.ridgeFlashing)
    const gableFlashing = group(gableCount, FLASHING_DEVELOPED_WIDTH.gableFlashing)

    flashings = {
      dripEdge,
      eavesFlashing,
      ridgeFlashing,
      gableFlashing,
      totalSurface: dripEdge.surface + eavesFlashing.surface + ridgeFlashing.surface + gableFlashing.surface,
    }
  }

  return { counterBattens, roofBattens, flashings }
}

export function counterBattenTotalLength(roofing: RoofingModel): number {
  return roofing.counterBattens.reduce((sum, cb) => sum + cb.length, 0)
}

export function roofBattenTotalLength(roofing: RoofingModel): number {
  return roofing.roofBattens.reduce((sum, rb) => sum + rb.length, 0)
}

export function flashingTotalSurface(roofing: RoofingModel): number {
  return roofing.flashings?.totalSurface ?? 0
}

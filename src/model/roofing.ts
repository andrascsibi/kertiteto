import type { StructureModel } from './types'

export const ROOF_BATTEN_DISTANCE = 0.2 // meters between roof battens
export const LAMBERIA_HEIGHT = 0.016    // 16mm thick
export const LAMBERIA_WIDTH  = 0.112    // 112mm wide across slope

// Developed width — flat-laid width of each flashing profile (m)
export const FLASHING_DEVELOPED_WIDTH = {
  dripEdge:      0.125,  // 125 mm
  eavesFlashing: 0.250,  // 250 mm
  ridgeFlashing: 0.540,  // 540 mm
  gableFlashing: 0.312,  // 312 mm
}
export const FLASHING_LENGTH  = 2    // meters per piece
export const FLASHING_OVERLAP = 0.1  // meters overlap between pieces

// Drip edge profile (membrane option)
export const DRIP_EDGE_FLAT_WIDTH  = 0.09   // 9cm flat part along slope
export const DRIP_EDGE_VISOR_WIDTH = 0.025  // 2.5cm visor hanging down
export const DRIP_EDGE_VISOR_ANGLE = 20     // degrees from vertical, leaning outward
export const DRIP_EDGE_THICKNESS   = 0.0005 // 0.5mm sheet metal

// Eaves flashing profile (roofing option)
export const EAVES_FLASHING_VISOR_WIDTH = 0.08  // 5cm visor
export const EAVES_FLASHING_ANGLE = 20          // degrees from vertical (same as drip edge)
export const EAVES_FLASHING_THICKNESS = 0.0005  // 0.5mm sheet metal

// Gable flashing profile (roofing option)
export const GABLE_FLASHING_SKIRT_HEIGHT = 0.142  // 142mm vertical skirt
export const GABLE_FLASHING_SKIRT_THICKNESS = 0.001  // 1mm
export const GABLE_FLASHING_CAP_HEIGHT = 0.025  // 2.5cm cap height (perpendicular to slope)
export const GABLE_FLASHING_CAP_WIDTH  = 0.075   // 7.5cm cap width (along X)
export const GABLE_FLASHING_VISOR_WIDTH = 0.015  // 1.5cm drip visor at skirt bottom
export const GABLE_FLASHING_VISOR_ANGLE = 60     // degrees from vertical, leaning outward
export const GABLE_FLASHING_OVERHANG   = 0.001  // 1mm X overhang beyond gable (avoids z-fighting with rafters)

export const EAVES_OVERLAP = 0.02  // 2cm — metal sheets + gable flashings extend past eave

export const SHEET_LENGTH    = 0.51   // 51cm sheet width along X (longitudinal)
export const SHEET_THICKNESS = 0.001  // 1mm
export const KORC_HEIGHT     = 0.025  // 2.5cm álló korc height
export const KORC_WIDTH      = 0.01   // 1cm álló korc width

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

export interface MetalSheet {
  /** Center X position */
  x: number
  /** Width along X axis (SHEET_LENGTH for full sheets, less for gable cut sheets) */
  width: number
}

export interface MetalSheets {
  sheetsPerSlope: number
  /** Positioned sheets for one slope (symmetric — same for both slopes) */
  sheets: MetalSheet[]
  /** Extent of each sheet along the slope direction (m) */
  slopeLength: number
  /** X positions of álló korc junctions between sheets */
  korcXPositions: number[]
  /** Slope shift toward eave for eaves flashing overlap (m) */
  eavesOverlap: number
}

export interface DripEdgeModel {
  /** Length along X axis (= totalLength) */
  length: number
}

export interface EavesFlashingModel {
  /** Length along X axis (= totalLength) */
  length: number
}

export interface GableFlashingModel {
  /** Half of totalLength — gable x positions are at ±halfLength */
  halfLength: number
  /** X overhang beyond gable (m) */
  overhang: number
  /** Slope extension past eave (m) */
  eavesOverlap: number
}

export interface LamberiaPlanks {
  planksPerSlope: number
  plankLength: number
  /** Width of last plank (trimmed to fit ridge), may be < LAMBERIA_WIDTH */
  lastPlankWidth: number
}

export interface RoofingModel {
  counterBattens: CounterBatten[]
  roofBattens: RoofBatten[]
  flashings: Flashings | null
  lamberia: LamberiaPlanks | null
  metalSheets: MetalSheets | null
  dripEdge: DripEdgeModel | null
  eavesFlashing: EavesFlashingModel | null
  gableFlashing: GableFlashingModel | null
}

export interface RoofingOptions {
  lamberia: boolean
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

  let lamberia: LamberiaPlanks | null = null
  if (options.lamberia) {
    const rafterLen = structure.rafters[0].length
    const planksPerSlope = Math.ceil(rafterLen / LAMBERIA_WIDTH)
    const remainder = rafterLen - (planksPerSlope - 1) * LAMBERIA_WIDTH
    lamberia = {
      planksPerSlope,
      plankLength: structure.totalLength,
      lastPlankWidth: remainder,
    }
  }

  let metalSheets: MetalSheets | null = null
  if (options.roofing) {
    const totalLength = structure.totalLength
    const rafterLen = structure.rafters[0].length
    const numSheets = Math.ceil(totalLength / SHEET_LENGTH)

    const sheets: MetalSheet[] = []
    const korcXPositions: number[] = []

    if (numSheets === 1) {
      sheets.push({ x: 0, width: totalLength })
    } else {
      const innerCount = numSheets - 2
      const gableWidth = (totalLength - innerCount * SHEET_LENGTH) / 2
      const halfTotal = totalLength / 2

      // First gable sheet (left, -x side)
      let cursor = -halfTotal
      sheets.push({ x: cursor + gableWidth / 2, width: gableWidth })
      cursor += gableWidth

      // Inner full sheets
      for (let i = 0; i < innerCount; i++) {
        korcXPositions.push(cursor)
        sheets.push({ x: cursor + SHEET_LENGTH / 2, width: SHEET_LENGTH })
        cursor += SHEET_LENGTH
      }

      // Last korc + gable sheet (right, +x side)
      korcXPositions.push(cursor)
      sheets.push({ x: cursor + gableWidth / 2, width: gableWidth })
    }

    metalSheets = {
      sheetsPerSlope: numSheets,
      sheets,
      slopeLength: rafterLen,
      korcXPositions,
      eavesOverlap: EAVES_OVERLAP,
    }
  }

  let dripEdge: DripEdgeModel | null = null
  if (options.membrane) {
    dripEdge = {
      length: structure.totalLength,
    }
  }

  let eavesFlashing: EavesFlashingModel | null = null
  if (options.roofing) {
    eavesFlashing = {
      length: structure.totalLength,
    }
  }

  let gableFlashing: GableFlashingModel | null = null
  if (options.roofing) {
    gableFlashing = {
      halfLength: structure.totalLength / 2,
      overhang: GABLE_FLASHING_OVERHANG,
      eavesOverlap: EAVES_OVERLAP,
    }
  }

  return { counterBattens, roofBattens, flashings, lamberia, metalSheets, dripEdge, eavesFlashing, gableFlashing }
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

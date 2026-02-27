import type { StructureModel } from './types'

export const ROOF_BATTEN_DISTANCE = 0.2 // meters between roof battens

export interface CounterBatten {
  /** Length along slope, same as corresponding rafter (m) */
  length: number
}

export interface RoofBatten {
  /** Length of one batten row (longitudinal span of building) (m) */
  length: number
}

export interface RoofingModel {
  counterBattens: CounterBatten[]
  roofBattens: RoofBatten[]
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
    const battenLength = structure.params.length + 2 * structure.params.gableOverhang
    for (let i = 0; i < totalRows; i++) {
      roofBattens.push({ length: battenLength })
    }
  }

  return { counterBattens, roofBattens }
}

export function counterBattenTotalLength(roofing: RoofingModel): number {
  return roofing.counterBattens.reduce((sum, cb) => sum + cb.length, 0)
}

export function roofBattenTotalLength(roofing: RoofingModel): number {
  return roofing.roofBattens.reduce((sum, rb) => sum + rb.length, 0)
}

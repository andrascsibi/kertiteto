import type { StructureModel } from './types'

export interface CounterBatten {
  /** Length along slope, same as corresponding rafter (m) */
  length: number
}

export interface RoofingModel {
  counterBattens: CounterBatten[]
}

export interface RoofingOptions {
  membrane: boolean
}

export function buildRoofing(structure: StructureModel, options: RoofingOptions): RoofingModel {
  const counterBattens: CounterBatten[] = []
  if (options.membrane) {
    for (const rafter of structure.rafters) {
      counterBattens.push({ length: rafter.length })
    }
  }
  return { counterBattens }
}

export function counterBattenTotalLength(roofing: RoofingModel): number {
  return roofing.counterBattens.reduce((sum, cb) => sum + cb.length, 0)
}

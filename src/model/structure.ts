/**
 * Assembles the full structural model from input parameters.
 *
 * Coordinate system:
 *   X: longitudinal (along ridge/purlins, length direction)
 *   Y: vertical (up)
 *   Z: cross-sectional (across span, width direction)
 *   Origin: center of footprint at ground level
 *
 * InputParams width/length are center-to-center pillar distances.
 * Outer footprint = (width + PILLAR_SIZE) × (length + PILLAR_SIZE).
 */

import type { InputParams, StructureModel, Pillar, Purlin, TieBeam, Rafter } from './types'
import {
  ridgeHeight,
  rafterLength,
  pillarCount,
  rafterSpacing,
  rafterCount,
  birdMouthAtBasePurlin,
  birdMouthAtRidgePurlin,
} from './geometry'

// Timber cross-section dimensions (m)
export const PILLAR_SIZE = 0.15   // 15×15 cm
export const PURLIN_SIZE = 0.15   // 15×15 cm (TALP SZELEMEN)
export const RIDGE_SIZE  = 0.10   // 10×10 cm (GERINC SZELEMEN)
export const RAFTER_WIDTH = 0.075 // 7.5 cm
export const RAFTER_DEPTH = 0.15  // 15 cm (the tall dimension, vertical when installed)

// Fixed structural constant
export const PILLAR_HEIGHT = 2.4  // m

export const DEFAULTS: InputParams = {
  width: 3.0,
  length: 4.0,
  pitch: 25,
  eavesOverhang: 0.5,
  gableOverhang: 0.3,
}

export function buildStructure(params: InputParams): StructureModel {
  const { width, length, pitch, eavesOverhang, gableOverhang } = params

  const DEG = Math.PI / 180
  const cosPitch = Math.cos(pitch * DEG)
  const tanPitch = Math.tan(pitch * DEG)

  // ── Vertical levels ──────────────────────────────────────────────────────
  const yPurlinCenter = PILLAR_HEIGHT + PURLIN_SIZE / 2
  const yPurlinTop    = PILLAR_HEIGHT + PURLIN_SIZE
  const yRidgeCenter  = yPurlinTop + ridgeHeight(width, pitch)

  // ── Longitudinal extents (purlins extend past gable rafters) ─────────────
  const xMin = -(length / 2 + gableOverhang)
  const xMax = +(length / 2 + gableOverhang)

  // ── Base purlins (TALP SZELEMEN) ─────────────────────────────────────────
  const basePurlins: [Purlin, Purlin] = [
    makePurlin(xMin, xMax, yPurlinCenter, -width / 2, PURLIN_SIZE),
    makePurlin(xMin, xMax, yPurlinCenter, +width / 2, PURLIN_SIZE),
  ]

  // ── Ridge purlin (GERINC SZELEMEN) ────────────────────────────────────────
  const ridgePurlin: Purlin = makePurlin(xMin, xMax, yRidgeCenter, 0, RIDGE_SIZE)

  // ── Tie beams (KOTOGERENDA) ───────────────────────────────────────────────
  // Always at the corner pillar x-positions (x = ±length/2), never at middle pillars.
  const tieBeams: TieBeam[] = [
    makeTieBeam(-length / 2, yPurlinCenter, width),
    makeTieBeam(+length / 2, yPurlinCenter, width),
  ]

  // ── Pillars ───────────────────────────────────────────────────────────────
  const pillars = buildPillars(width, length, pillarCount(length))

  // ── Rafters ───────────────────────────────────────────────────────────────
  const bmBase  = birdMouthAtBasePurlin(pitch)
  const bmRidge = birdMouthAtRidgePurlin(pitch)

  // Bird mouth positions along rafter from eave end (to purlin centerlines)
  const dBase  = eavesOverhang / cosPitch
  const dRidge = (eavesOverhang + width / 2) / cosPitch

  const rLength  = rafterLength(width, pitch, eavesOverhang)
  const nRafters = rafterCount(length)
  const spacing  = rafterSpacing(length)

  // Eave end y: rafter bearing at base purlin top, then drop by eavesOverhang down the slope
  const yEave = yPurlinTop - eavesOverhang * tanPitch

  const leftRafters: Rafter[]  = []
  const rightRafters: Rafter[] = []

  for (let i = 0; i < nRafters; i++) {
    const x = -length / 2 + i * spacing

    leftRafters.push({
      eaveEnd:  { x, y: yEave, z: -(width / 2 + eavesOverhang) },
      ridgeEnd: { x, y: yRidgeCenter, z: 0 },
      birdMouthBase:  { ...bmBase,  distanceFromEave: dBase  },
      birdMouthRidge: { ...bmRidge, distanceFromEave: dRidge },
      length: rLength,
    })

    rightRafters.push({
      eaveEnd:  { x, y: yEave, z: +(width / 2 + eavesOverhang) },
      ridgeEnd: { x, y: yRidgeCenter, z: 0 },
      birdMouthBase:  { ...bmBase,  distanceFromEave: dBase  },
      birdMouthRidge: { ...bmRidge, distanceFromEave: dRidge },
      length: rLength,
    })
  }

  return {
    params,
    ridgeHeight: ridgeHeight(width, pitch),
    pillarHeight: PILLAR_HEIGHT,
    pillars,
    basePurlins,
    ridgePurlin,
    tieBeams,
    rafters: [...leftRafters, ...rightRafters],
    rafterSpacing: spacing,
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePurlin(xMin: number, xMax: number, y: number, z: number, size: number): Purlin {
  return {
    start:  { x: xMin, y, z },
    end:    { x: xMax, y, z },
    width:  size,
    height: size,
  }
}

function makeTieBeam(x: number, y: number, width: number): TieBeam {
  return {
    start: { x, y, z: -width / 2 },
    end:   { x, y, z: +width / 2 },
  }
}

function buildPillars(width: number, length: number, nPillars: 4 | 6): Pillar[] {
  const xPositions = nPillars === 4
    ? [-length / 2, +length / 2]
    : [-length / 2, 0, +length / 2]

  const pillars: Pillar[] = []
  for (const x of xPositions) {
    for (const z of [-width / 2, +width / 2]) {
      pillars.push({ base: { x, y: 0, z }, height: PILLAR_HEIGHT })
    }
  }
  return pillars
}

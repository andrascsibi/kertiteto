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
 *
 * Rafter centerline derivation:
 *   At the base purlin, the seat cut sits at y = yBasePurlinTop.
 *   The rafter's inclined bottom face at the plumb-cut z-position is:
 *     y_bottom = y_centerline - RAFTER_DEPTH/2 * cos(pitch)
 *   We want the plumb height (vertical notch depth) = BIRD_MOUTH_PLUMB_HEIGHT:
 *     BIRD_MOUTH_PLUMB_HEIGHT = yBasePurlinTop - y_bottom
 *     → y_centerline_at_base = yBasePurlinTop + RAFTER_DEPTH / (2 * cos(pitch)) - BIRD_MOUTH_PLUMB_HEIGHT
 *
 *   Ridge purlin (GERINC SZELEMEN) sits BELOW the rafters (Hungarian style).
 *   Bird line (KARMI VONAL): the line connecting the innermost seat-cut corners
 *   of both bird mouths runs at exactly the pitch angle.
 *     base seat corner:  z = ±width/2,     y = yBasePurlinTop
 *     ridge seat corner: z = ±RIDGE_SIZE/2, y = yRidgePurlinTop
 *     horizontal run = (width - RIDGE_SIZE) / 2
 *     → yRidgePurlinTop = yBasePurlinTop + ridgeHeight(width - RIDGE_SIZE, pitch)
 *     → yRidgePurlinCenter = yRidgePurlinTop - RIDGE_SIZE/2
 */

import type { InputParams, StructureModel, Pillar, Purlin, TieBeam, Rafter } from './types'
import {
  ridgeHeight,
  rafterLength,
  pillarCount,
  birdMouthAtBasePurlin,
  birdMouthAtRidgePurlin,
  MAX_RAFTER_SPACING,
  BIRD_MOUTH_PLUMB_HEIGHT,
} from './geometry'

// Timber cross-section dimensions (m)
export const PILLAR_SIZE  = 0.15   // 15×15 cm
export const PURLIN_SIZE  = 0.15   // 15×15 cm (TALP SZELEMEN)
export const RIDGE_SIZE   = 0.10   // 10×10 cm (GERINC SZELEMEN)
export const RAFTER_WIDTH = 0.075  // 7.5 cm
export const RAFTER_DEPTH = 0.15   // 15 cm (the tall dimension, perpendicular to rafter axis)

export const PILLAR_HEIGHT = 2.4   // m (fixed)

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
  const H_ridge  = ridgeHeight(width, pitch)

  // ── Vertical levels ──────────────────────────────────────────────────────────
  const yPurlinCenter = PILLAR_HEIGHT + PURLIN_SIZE / 2
  const yBasePurlinTop = PILLAR_HEIGHT + PURLIN_SIZE

  // Ridge purlin top: bird line (KARMI VONAL) from base seat corner to ridge seat corner
  // has exactly the pitch angle; horizontal run = (width - RIDGE_SIZE) / 2.
  const yRidgePurlinTop    = yBasePurlinTop + ridgeHeight(width - RIDGE_SIZE, pitch)
  const yRidgePurlinCenter = yRidgePurlinTop - RIDGE_SIZE / 2

  // Rafter centerline vertical offset above bearing surface.
  // The centerline at z = ±width/2 is offset up from yBasePurlinTop by this amount.
  const rafterYOffset = - BIRD_MOUTH_PLUMB_HEIGHT + RAFTER_DEPTH / cosPitch / 2

  // Rafter y at base purlin and at ridge
  const yRafterAtBase  = yBasePurlinTop + rafterYOffset
  const yRafterAtRidge = yRafterAtBase + H_ridge

  // Eave end y: project back from base purlin down the slope by eavesOverhang
  const yEave = yRafterAtBase - eavesOverhang * tanPitch

  // ── Longitudinal extents ─────────────────────────────────────────────────────
  // Purlins run from gable end to gable end of the roof surface
  const xMin = -(length / 2 + gableOverhang)
  const xMax = +(length / 2 + gableOverhang)

  // ── Base purlins (TALP SZELEMEN) ─────────────────────────────────────────────
  const basePurlins: [Purlin, Purlin] = [
    makePurlin(xMin, xMax, yPurlinCenter, -width / 2, PURLIN_SIZE),
    makePurlin(xMin, xMax, yPurlinCenter, +width / 2, PURLIN_SIZE),
  ]

  // ── Ridge purlin (GERINC SZELEMEN) ───────────────────────────────────────────
  const ridgePurlin: Purlin = makePurlin(xMin, xMax, yRidgePurlinCenter, 0, RIDGE_SIZE)

  // ── Tie beams (KOTOGERENDA) ──────────────────────────────────────────────────
  // Always at corner pillar x-positions only (never at middle pillars).
  const tieBeams: TieBeam[] = [
    makeTieBeam(-length / 2, yPurlinCenter, width),
    makeTieBeam(+length / 2, yPurlinCenter, width),
  ]

  // ── Pillars ──────────────────────────────────────────────────────────────────
  const pillars = buildPillars(width, length, pillarCount(length))

  // ── Rafter layout ────────────────────────────────────────────────────────────
  // Rafters span the full purlin length (including gable overhang).
  // Gable rafters are flush with the purlin ends; their centers are
  // inset by half a rafter width.
  const purlinLength   = length + 2 * gableOverhang
  const rafterSpanCC   = purlinLength - RAFTER_WIDTH  // center-to-center, first to last
  const nBays          = Math.ceil(rafterSpanCC / MAX_RAFTER_SPACING)
  const nRafters       = nBays + 1
  const xSpacing       = rafterSpanCC / nBays
  const xFirst         = xMin + RAFTER_WIDTH / 2  // center of first (gable) rafter

  // ── Bird mouth parameters ────────────────────────────────────────────────────
  const bmBase  = birdMouthAtBasePurlin(pitch)
  const bmRidge = birdMouthAtRidgePurlin(pitch)

  // Distance along rafter from eave end to each purlin centerline
  const dBase  = eavesOverhang / cosPitch
  const dRidge = (eavesOverhang + width / 2) / cosPitch

  const rLength = rafterLength(width, pitch, eavesOverhang)

  // ── Build rafter pairs ───────────────────────────────────────────────────────
  const leftRafters:  Rafter[] = []
  const rightRafters: Rafter[] = []

  for (let i = 0; i < nRafters; i++) {
    const x = xFirst + i * xSpacing

    leftRafters.push({
      eaveEnd:  { x, y: yEave,          z: -(width / 2 + eavesOverhang) },
      ridgeEnd: { x, y: yRafterAtRidge, z: 0 },
      birdMouthBase:  { ...bmBase,  distanceFromEave: dBase  },
      birdMouthRidge: { ...bmRidge, distanceFromEave: dRidge },
      length: rLength,
    })

    rightRafters.push({
      eaveEnd:  { x, y: yEave,          z: +(width / 2 + eavesOverhang) },
      ridgeEnd: { x, y: yRafterAtRidge, z: 0 },
      birdMouthBase:  { ...bmBase,  distanceFromEave: dBase  },
      birdMouthRidge: { ...bmRidge, distanceFromEave: dRidge },
      length: rLength,
    })
  }

  return {
    params,
    ridgeHeight: H_ridge,
    pillarHeight: PILLAR_HEIGHT,
    pillars,
    basePurlins,
    ridgePurlin,
    tieBeams,
    rafters: [...leftRafters, ...rightRafters],
    rafterSpacing: xSpacing,
  }
}

// ── Derived metrics ──────────────────────────────────────────────────────────

export interface StructureMetrics {
  /** Total timber volume (m³) */
  timberVolume: number
  /** Total timber surface for treatment, ignoring ends (m²) */
  timberSurface: number
  /** Total roof surface, both slopes (m²) */
  roofSurface: number
}

export function computeMetrics(model: StructureModel): StructureMetrics {
  const purlinLength = Math.abs(model.basePurlins[0].end.x - model.basePurlins[0].start.x)
  const tieBeamLength = Math.abs(model.tieBeams[0].end.z - model.tieBeams[0].start.z)
  const rafterLen = model.rafters[0].length

  // Volume
  const pillarVol   = model.pillars.length * PILLAR_SIZE * PILLAR_SIZE * PILLAR_HEIGHT
  const basePurVol  = 2 * PURLIN_SIZE * PURLIN_SIZE * purlinLength
  const ridgePurVol = RIDGE_SIZE * RIDGE_SIZE * purlinLength
  const tieBeamVol  = model.tieBeams.length * PURLIN_SIZE * PURLIN_SIZE * tieBeamLength
  const rafterVol   = model.rafters.length * RAFTER_WIDTH * RAFTER_DEPTH * rafterLen
  const timberVolume = pillarVol + basePurVol + ridgePurVol + tieBeamVol + rafterVol

  // Surface (perimeter × length, ignoring ends)
  const pillarSurf   = model.pillars.length * PILLAR_HEIGHT * (4 * PILLAR_SIZE)
  const basePurSurf  = 2 * purlinLength * 2 * (PURLIN_SIZE + PURLIN_SIZE)
  const ridgePurSurf = purlinLength * 2 * (RIDGE_SIZE + RIDGE_SIZE)
  const tieBeamSurf  = model.tieBeams.length * tieBeamLength * 2 * (PURLIN_SIZE + PURLIN_SIZE)
  const rafterSurf   = model.rafters.length * rafterLen * (2 * RAFTER_WIDTH + 2 * RAFTER_DEPTH)
  const timberSurface = pillarSurf + basePurSurf + ridgePurSurf + tieBeamSurf + rafterSurf

  // Roof surface: 2 slopes × rafter length × purlin run
  const roofSurface = 2 * rafterLen * purlinLength

  return { timberVolume, timberSurface, roofSurface }
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

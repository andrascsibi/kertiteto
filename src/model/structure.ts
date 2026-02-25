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
 *     BIRD_MOUTH_PLUMB_HEIGHT = y_bottom - yBasePurlinTop
 *     → y_centerline_at_base = yBasePurlinTop + BIRD_MOUTH_PLUMB_HEIGHT + RAFTER_DEPTH/2 * cos(pitch)
 *
 *   Ridge purlin (GERINC SZELEMEN) sits BELOW the rafters (Hungarian style).
 *   The same derivation at the ridge gives:
 *     yRidgePurlinCenter = yBasePurlinTop + ridgeHeight - RIDGE_SIZE/2
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
  const yBasePurlinTop    = PILLAR_HEIGHT + PURLIN_SIZE

  // Ridge purlin center: sits below rafters (Hungarian style).
  // Derived from bird mouth geometry; see module comment.
  const yRidgePurlinCenter = yBasePurlinTop + H_ridge - RIDGE_SIZE / 2

  // Rafter centerline vertical offset above bearing surface.
  // The centerline at z = ±width/2 is offset up from yBasePurlinTop by this amount.
  const rafterYOffset = BIRD_MOUTH_PLUMB_HEIGHT + RAFTER_DEPTH / (2 * cosPitch)

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

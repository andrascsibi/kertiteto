/**
 * Assembles the full structural model from input parameters.
 *
 * Coordinate system:
 *   X: longitudinal (along ridge/purlins, length direction)
 *   Y: vertical (up)
 *   Z: cross-sectional (across span, width direction)
 *   Origin: center of footprint at ground level
 *
 * InputParams width/length are outer-edge-to-outer-edge pillar distances.
 * Pillar centers at ±(width/2 - PILLAR_SIZE/2), ±(length/2 - PILLAR_SIZE/2).
 * Purlin centers coincide with pillar centers (PURLIN_SIZE == PILLAR_SIZE),
 * so the purlin outer face is flush with the pillar outer edge at ±width/2.
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

import type { InputParams, StructureModel, Pillar, Purlin, TieBeam, Rafter, RidgeTie, KneeBrace } from './types'
import {
  ridgeHeight,
  rafterLength,
  pillarCount,
  birdMouthAtBasePurlin,
  birdMouthAtRidgePurlin,
  MAX_RAFTER_SPACING,
  MAX_UNSUPPORTED_SPAN,
  BIRD_MOUTH_PLUMB_HEIGHT,
} from './geometry'

// Timber cross-section dimensions (m)
export const PILLAR_SIZE  = 0.15   // 15×15 cm
export const PURLIN_SIZE  = 0.15   // 15×15 cm (TALP SZELEMEN)
export const RIDGE_SIZE   = 0.10   // 10×10 cm (GERINC SZELEMEN)
export const RAFTER_WIDTH = 0.075  // 7.5 cm
export const RAFTER_DEPTH = 0.15   // 15 cm (the tall dimension, perpendicular to rafter axis)

export const RIDGE_TIE_NOTCH = 0.05 // overlap with ridge purlin (m)
export const RIDGE_TIE_WIDTH = 0.05 // 5 cm (along ridge direction)
export const RIDGE_TIE_DEPTH = 0.15 // 15 cm (vertical extent)

export const KNEE_BRACE_SIZE   = 0.1  // 10×10 cm cross-section
export const KNEE_BRACE_LENGTH = 1.0   // 1 m along diagonal

export const PILLAR_HEIGHT = 2.4   // m (fixed)

export const DEFAULTS: InputParams = {
  width: 3.0,
  length: 3.3,
  pitch: 25,
  eavesOverhang: 0.35,
  gableOverhang: 0.35,
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
  // Purlin center is inset by PURLIN_SIZE/2 from the outer edge; outer face flush at ±width/2
  const zPurlin = width / 2 - PURLIN_SIZE / 2
  const basePurlins: [Purlin, Purlin] = [
    makePurlin(xMin, xMax, yPurlinCenter, -zPurlin, PURLIN_SIZE),
    makePurlin(xMin, xMax, yPurlinCenter, +zPurlin, PURLIN_SIZE),
  ]

  // ── Ridge purlin (GERINC SZELEMEN) ───────────────────────────────────────────
  const ridgePurlin: Purlin = makePurlin(xMin, xMax, yRidgePurlinCenter, 0, RIDGE_SIZE)

  // ── Pillars ──────────────────────────────────────────────────────────────────
  const nPillars = pillarCount(length)
  const pillarXPositions = buildPillarXPositions(length, nPillars)
  const yRidgePurlinBottom = yRidgePurlinCenter - RIDGE_SIZE / 2
  const pillars = buildPillars(width, pillarXPositions, yRidgePurlinBottom)

  // ── Tie beams (KOTOGERENDA) ──────────────────────────────────────────────────
  // One tie beam above every pillar row, connecting the two base purlin centers.
  const tieBeams: TieBeam[] = pillarXPositions.map(x =>
    makeTieBeam(x, yPurlinCenter, zPurlin)
  )

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

  // ── Ridge ties (KAKASULO) ────────────────────────────────────────────────────
  // Trapezoid pieces straddling the ridge purlin, in pairs on both sides of each rafter.
  // Top surface horizontal; sides flush with rafter top surface (parallel to slope).
  // Gable rafters get a single ridge tie on the inner side only.
  const yRidgeTieTop    = yRidgePurlinTop - RIDGE_SIZE + RIDGE_TIE_NOTCH
  const yRidgeTieBottom = yRidgeTieTop - RIDGE_TIE_DEPTH
  const yRafterTop      = yRafterAtRidge + RAFTER_DEPTH / (2 * cosPitch)
  const zHalfTop        = (yRafterTop - yRidgeTieTop) / tanPitch
  const zHalfBottom     = zHalfTop + RIDGE_TIE_DEPTH / tanPitch
  const xOffset         = RAFTER_WIDTH / 2 + RIDGE_TIE_WIDTH / 2

  const ridgeTies: RidgeTie[] = []
  for (let i = 0; i < nRafters; i++) {
    const xRafter = xFirst + i * xSpacing
    if (i === 0) {
      // First gable rafter: single tie on inner side (+x)
      ridgeTies.push({ x: xRafter + xOffset, yTop: yRidgeTieTop, yBottom: yRidgeTieBottom, zHalfTop, zHalfBottom })
    } else if (i === nRafters - 1) {
      // Last gable rafter: single tie on inner side (-x)
      ridgeTies.push({ x: xRafter - xOffset, yTop: yRidgeTieTop, yBottom: yRidgeTieBottom, zHalfTop, zHalfBottom })
    } else {
      // Interior rafters: pair on both sides
      ridgeTies.push({ x: xRafter - xOffset, yTop: yRidgeTieTop, yBottom: yRidgeTieBottom, zHalfTop, zHalfBottom })
      ridgeTies.push({ x: xRafter + xOffset, yTop: yRidgeTieTop, yBottom: yRidgeTieBottom, zHalfTop, zHalfBottom })
    }
  }

  // ── Corner knee braces (KONYOKFA) ────────────────────────────────────────────
  const kneeBraces = buildCornerKneeBraces(pillarXPositions, width)

  return {
    params,
    ridgeHeight: H_ridge,
    pillarHeight: PILLAR_HEIGHT,
    pillars,
    basePurlins,
    ridgePurlin,
    tieBeams,
    ridgeTies,
    rafters: [...leftRafters, ...rightRafters],
    rafterSpacing: xSpacing,
    kneeBraces,
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

  // Volume (pillar heights vary: ridge pillars are taller)
  const pillarVol   = model.pillars.reduce((sum, p) => sum + PILLAR_SIZE * PILLAR_SIZE * p.height, 0)
  const basePurVol  = 2 * PURLIN_SIZE * PURLIN_SIZE * purlinLength
  const ridgePurVol = RIDGE_SIZE * RIDGE_SIZE * purlinLength
  const tieBeamVol  = model.tieBeams.length * PURLIN_SIZE * PURLIN_SIZE * tieBeamLength
  const rafterVol   = model.rafters.length * RAFTER_WIDTH * RAFTER_DEPTH * rafterLen
  // Ridge tie: trapezoid area × width
  const ridgeTieVol = model.ridgeTies.length > 0
    ? model.ridgeTies.length * (model.ridgeTies[0].zHalfTop + model.ridgeTies[0].zHalfBottom) * RIDGE_TIE_DEPTH * RIDGE_TIE_WIDTH
    : 0
  const kneeBraceVol = model.kneeBraces.length * KNEE_BRACE_SIZE * KNEE_BRACE_SIZE * KNEE_BRACE_LENGTH
  const timberVolume = pillarVol + basePurVol + ridgePurVol + tieBeamVol + rafterVol + ridgeTieVol + kneeBraceVol

  // Surface (perimeter × length, ignoring ends)
  const pillarSurf   = model.pillars.reduce((sum, p) => sum + p.height * (4 * PILLAR_SIZE), 0)
  const basePurSurf  = 2 * purlinLength * 2 * (PURLIN_SIZE + PURLIN_SIZE)
  const ridgePurSurf = purlinLength * 2 * (RIDGE_SIZE + RIDGE_SIZE)
  const tieBeamSurf  = model.tieBeams.length * tieBeamLength * 2 * (PURLIN_SIZE + PURLIN_SIZE)
  const rafterSurf   = model.rafters.length * rafterLen * (2 * RAFTER_WIDTH + 2 * RAFTER_DEPTH)
  // Ridge tie surface: top + bottom + 2 sloped sides (ignoring ends)
  const cosPitch = Math.cos(model.params.pitch * Math.PI / 180)
  const ridgeTieSurf = model.ridgeTies.length > 0
    ? model.ridgeTies.length * RIDGE_TIE_WIDTH * (
        2 * model.ridgeTies[0].zHalfTop +
        2 * model.ridgeTies[0].zHalfBottom +
        2 * RIDGE_TIE_DEPTH / cosPitch
      )
    : 0
  const kneeBraceSurf = model.kneeBraces.length * KNEE_BRACE_LENGTH * (4 * KNEE_BRACE_SIZE)
  const timberSurface = pillarSurf + basePurSurf + ridgePurSurf + tieBeamSurf + rafterSurf + ridgeTieSurf + kneeBraceSurf

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

function makeTieBeam(x: number, y: number, zHalf: number): TieBeam {
  return {
    start: { x, y, z: -zHalf },
    end:   { x, y, z: +zHalf },
  }
}

function buildCornerKneeBraces(pillarXPositions: number[], width: number): KneeBrace[] {
  const leg = KNEE_BRACE_LENGTH * Math.cos(Math.PI / 4)  // 1/√2 ≈ 0.707
  const zHalf = width / 2 - PILLAR_SIZE / 2  // pillar center z offset
  const yJunction = PILLAR_HEIGHT + PURLIN_SIZE / 2  // purlin/tie beam center level
  const braces: KneeBrace[] = []

  // Only corner rows (first and last)
  const cornerXs = [pillarXPositions[0], pillarXPositions[pillarXPositions.length - 1]]

  for (const xP of cornerXs) {
    const sx = Math.sign(-xP) || 1  // toward center along x
    for (const zP of [-zHalf, +zHalf]) {
      const sz = Math.sign(-zP) || 1  // toward center along z

      // Brace 1: Pillar ↔ Tie beam (YZ plane, x = const)
      braces.push({
        start: { x: xP, y: yJunction - leg, z: zP },
        end:   { x: xP, y: yJunction, z: zP + sz * leg },
      })

      // Brace 2: Pillar ↔ Purlin (XY plane, z = const)
      braces.push({
        start: { x: xP, y: yJunction - leg, z: zP },
        end:   { x: xP + sx * leg, y: yJunction, z: zP },
      })

      // Brace 3: Purlin ↔ Tie beam (XZ plane, horizontal)
      braces.push({
        start: { x: xP + sx * leg, y: yJunction, z: zP },
        end:   { x: xP, y: yJunction, z: zP + sz * leg },
      })
    }
  }

  return braces
}

function buildPillarXPositions(length: number, nPillars: number): number[] {
  const xHalf = length / 2 - PILLAR_SIZE / 2
  const rows = nPillars / 2
  const positions: number[] = []
  for (let i = 0; i < rows; i++) {
    positions.push(-xHalf + i * (2 * xHalf) / (rows - 1))
  }
  return positions
}

function buildPillars(width: number, xPositions: number[], ridgePillarHeight: number): Pillar[] {
  const zHalf = width / 2 - PILLAR_SIZE / 2
  const innerSpan = width - 2 * PILLAR_SIZE
  const needsCenterPillar = innerSpan > MAX_UNSUPPORTED_SPAN
  const pillars: Pillar[] = []
  for (let i = 0; i < xPositions.length; i++) {
    const x = xPositions[i]
    for (const z of [-zHalf, +zHalf]) {
      pillars.push({ base: { x, y: 0, z }, height: PILLAR_HEIGHT })
    }
    // Ridge pillar at z=0 for corner (end) rows only, extends to ridge purlin bottom
    if (needsCenterPillar && (i === 0 || i === xPositions.length - 1)) {
      pillars.push({ base: { x, y: 0, z: 0 }, height: ridgePillarHeight })
    }
  }
  return pillars
}

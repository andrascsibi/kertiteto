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
  MAX_UNSUPPORTED_TIE_BEAM_SPAN,
  LONG_RAFTER_LENGTH,
  BIRD_MOUTH_PLUMB_HEIGHT,
} from './geometry'

// Timber cross-section dimensions (m)
export const PILLAR_SIZE  = 0.15   // 15×15 cm
export const PURLIN_SIZE  = 0.15   // 15×15 cm (TALP SZELEMEN)
export const RIDGE_SIZE       = 0.10  // 10×10 cm (GERINC SZELEMEN, default)
export const RIDGE_SIZE_WIDE  = 0.12  // 12×12 cm (wider structures with center pillars)
export const RAFTER_WIDTH = 0.075       // 7.5 cm (default)
export const RAFTER_WIDTH_LONG = 0.10   // 10 cm (for long rafter spans)
export const RAFTER_DEPTH = 0.15        // 15 cm (the tall dimension, perpendicular to rafter axis)

export const RIDGE_TIE_NOTCH = 0.05 // overlap with ridge purlin (m)
export const RIDGE_TIE_WIDTH = 0.05 // 5 cm (along ridge direction)
export const RIDGE_TIE_DEPTH = 0.15 // 15 cm (vertical extent)

export const KNEE_BRACE_WIDTH  = 0.075 // 7.5 cm (along ridge / along purlin)
export const KNEE_BRACE_DEPTH  = 0.15  // 15 cm (the tall dimension)
export const KNEE_BRACE_LENGTH = 1.0   // 1 m along diagonal
export const RIDGE_KNEE_BRACE_LENGTH = 0.8  // shorter braces at ridge to clear ridge ties

export const GROUND_SCREW_HEIGHT = 0.05 // m — elevation above ground for ground screws
export const PILLAR_HEIGHT = 2.2   // m (fixed)

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

  // ── Ridge purlin size (conditional on span) ─────────────────────────────────
  const innerSpan = width - 2 * PILLAR_SIZE
  const needsCenterPillars = innerSpan > MAX_UNSUPPORTED_TIE_BEAM_SPAN
  const ridgeSize = needsCenterPillars ? RIDGE_SIZE_WIDE : RIDGE_SIZE

  // ── Vertical levels ──────────────────────────────────────────────────────────
  const yPurlinCenter = GROUND_SCREW_HEIGHT + PILLAR_HEIGHT + PURLIN_SIZE / 2
  const yBasePurlinTop = GROUND_SCREW_HEIGHT + PILLAR_HEIGHT + PURLIN_SIZE

  // Ridge purlin top: bird line (KARMI VONAL) from base seat corner to ridge seat corner
  // has exactly the pitch angle; horizontal run = (width - ridgeSize) / 2.
  const yRidgePurlinTop    = yBasePurlinTop + ridgeHeight(width - ridgeSize, pitch)
  const yRidgePurlinCenter = yRidgePurlinTop - ridgeSize / 2

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
  const basePurlins: Purlin[] = [
    makePurlin(xMin, xMax, yPurlinCenter, -zPurlin, PURLIN_SIZE),
    makePurlin(xMin, xMax, yPurlinCenter, +zPurlin, PURLIN_SIZE),
  ]

  // ── Ridge purlin (GERINC SZELEMEN) ───────────────────────────────────────────
  const ridgePurlin: Purlin = makePurlin(xMin, xMax, yRidgePurlinCenter, 0, ridgeSize)

  // ── Pillars ──────────────────────────────────────────────────────────────────
  const nPillars = pillarCount(length)
  const pillarXPositions = buildPillarXPositions(length, nPillars)
  const yRidgePurlinBottom = yRidgePurlinCenter - ridgeSize / 2
  const ridgePillarHeight = yRidgePurlinBottom - GROUND_SCREW_HEIGHT
  const pillars = buildPillars(width, pillarXPositions, ridgePillarHeight)

  // ── Tie beams (KOTOGERENDA) ──────────────────────────────────────────────────
  // One tie beam above every pillar row, connecting the two base purlin centers.
  const tieBeams: TieBeam[] = pillarXPositions.map(x =>
    makeTieBeam(x, yPurlinCenter, zPurlin)
  )

  // ── Rafter layout ────────────────────────────────────────────────────────────
  // Main rafters sit directly above pillar rows. How many depends on structure size:
  //   2 pillar rows: no main rafters — equidistant gable-to-gable
  //   3 pillar rows: main rafter at interior (middle) pillar only
  //   4+ pillar rows: main rafters at all pillar positions
  // Gable rafters are flush with the purlin ends.
  // Regular (fill) rafters are evenly spaced within each segment, respecting MAX_RAFTER_SPACING.
  const purlinLength = length + 2 * gableOverhang
  const rafterSpan = rafterLength(width, pitch, 0)
  const rw = rafterSpan > LONG_RAFTER_LENGTH ? RAFTER_WIDTH_LONG : RAFTER_WIDTH
  const xGableLeft   = xMin + rw / 2
  const xGableRight  = xMax - rw / 2

  // Which pillar positions become main rafter anchors
  const mainPillarXs = pillarXPositions.length >= 4 ? pillarXPositions : pillarXPositions.slice(1, -1)

  // Ordered anchor X positions: gable left, main pillars, gable right
  const anchorXs: { x: number; type: 'gable' | 'main' }[] = [
    { x: xGableLeft, type: 'gable' },
    ...mainPillarXs.map(x => ({ x, type: 'main' as const })),
    { x: xGableRight, type: 'gable' },
  ]

  // Build rafter X positions with types by filling each segment
  const rafterPositions: { x: number; type: Rafter['type'] }[] = []
  for (let seg = 0; seg < anchorXs.length; seg++) {
    // Add the anchor itself (skip duplicates — shouldn't happen but guard)
    if (seg === 0 || Math.abs(anchorXs[seg].x - anchorXs[seg - 1].x) > 1e-9) {
      rafterPositions.push(anchorXs[seg])
    }
    // Fill between this anchor and the next
    if (seg < anchorXs.length - 1) {
      const xA = anchorXs[seg].x
      const xB = anchorXs[seg + 1].x
      const span = xB - xA
      const nBays = Math.ceil(span / MAX_RAFTER_SPACING)
      if (nBays > 1) {
        const step = span / nBays
        for (let j = 1; j < nBays; j++) {
          rafterPositions.push({ x: xA + j * step, type: 'regular' })
        }
      }
    }
  }

  // Max spacing across all adjacent pairs (for model metadata)
  let maxSpacing = 0
  const sortedXs = rafterPositions.map(r => r.x).sort((a, b) => a - b)
  for (let i = 1; i < sortedXs.length; i++) {
    maxSpacing = Math.max(maxSpacing, sortedXs[i] - sortedXs[i - 1])
  }

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

  for (const rp of rafterPositions) {
    leftRafters.push({
      eaveEnd:  { x: rp.x, y: yEave,          z: -(width / 2 + eavesOverhang) },
      ridgeEnd: { x: rp.x, y: yRafterAtRidge, z: 0 },
      birdMouthBase:  { ...bmBase,  distanceFromEave: dBase  },
      birdMouthRidge: { ...bmRidge, distanceFromEave: dRidge },
      length: rLength,
      width: rw,
      depth: RAFTER_DEPTH,
      type: rp.type,
    })

    rightRafters.push({
      eaveEnd:  { x: rp.x, y: yEave,          z: +(width / 2 + eavesOverhang) },
      ridgeEnd: { x: rp.x, y: yRafterAtRidge, z: 0 },
      birdMouthBase:  { ...bmBase,  distanceFromEave: dBase  },
      birdMouthRidge: { ...bmRidge, distanceFromEave: dRidge },
      length: rLength,
      width: rw,
      depth: RAFTER_DEPTH,
      type: rp.type,
    })
  }

  // ── Ridge ties (KAKASULO) ────────────────────────────────────────────────────
  // Trapezoid pieces straddling the ridge purlin, in pairs on both sides of each rafter.
  // Top surface horizontal; sides flush with rafter top surface (parallel to slope).
  // Gable rafters get a single ridge tie on the inner side only.
  const yRidgeTieTop    = yRidgePurlinTop - ridgeSize + RIDGE_TIE_NOTCH
  const yRidgeTieBottom = yRidgeTieTop - RIDGE_TIE_DEPTH
  const yRafterTop      = yRafterAtRidge + RAFTER_DEPTH / (2 * cosPitch)
  const zHalfTop        = (yRafterTop - yRidgeTieTop) / tanPitch
  const zHalfBottom     = zHalfTop + RIDGE_TIE_DEPTH / tanPitch
  const xOffset         = rw / 2 + RIDGE_TIE_WIDTH / 2

  const nRafters = rafterPositions.length
  const ridgeTies: RidgeTie[] = []
  for (let i = 0; i < nRafters; i++) {
    const xRafter = rafterPositions[i].x
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

  // ── King posts (FÜGGESZTŐMŰ) ─────────────────────────────────────────────────
  // Vertical members at interior pillar rows, z=0, from tie beam top to ridge purlin bottom.
  // Only needed when building is too narrow for center pillars — king posts replace them structurally.
  const kingPosts: Pillar[] = []
  if (needsCenterPillars) {
    for (let i = 1; i < pillarXPositions.length - 1; i++) {
      const kpHeight = yRidgePurlinBottom - yBasePurlinTop
      kingPosts.push({ base: { x: pillarXPositions[i], y: yBasePurlinTop, z: 0 }, height: kpHeight })
    }
  }

  // ── Knee braces (KONYOKFA) ───────────────────────────────────────────────────
  const kneeBraces = buildKneeBraces(pillarXPositions, width, needsCenterPillars)

  // ── King post / center pillar → ridge purlin knee braces ────────────────────
  const kpLeg = RIDGE_KNEE_BRACE_LENGTH * Math.cos(Math.PI / 4)
  // Interior king posts: braces in both X directions
  for (const kp of kingPosts) {
    for (const dx of [-1, +1]) {
      kneeBraces.push({
        start: { x: kp.base.x, y: yRidgePurlinCenter - kpLeg, z: 0 },
        end:   { x: kp.base.x + dx * kpLeg, y: yRidgePurlinCenter, z: 0 },
      })
    }
  }
  // Center pillars at corner rows (when wide): brace inward toward center along X
  if (needsCenterPillars) {
    for (let i = 0; i < pillarXPositions.length; i++) {
      const isCorner = i === 0 || i === pillarXPositions.length - 1
      if (!isCorner) continue
      const xP = pillarXPositions[i]
      const sx = Math.sign(-xP) || 1
      kneeBraces.push({
        start: { x: xP, y: yRidgePurlinCenter - kpLeg, z: 0 },
        end:   { x: xP + sx * kpLeg, y: yRidgePurlinCenter, z: 0 },
      })
    }
  }

  // ── King braces (center purlin → main rafter, in x=const plane at 45°) ───
  if (needsCenterPillars && mainPillarXs.length > 0) {
    const kingBraceD = (yRafterAtRidge - yPurlinCenter) / (1 + tanPitch)
    for (const mx of mainPillarXs) {
      // Left slope
      kneeBraces.push({
        start: { x: mx, y: yPurlinCenter, z: 0 },
        end:   { x: mx, y: yPurlinCenter + kingBraceD, z: -kingBraceD },
      })
      // Right slope
      kneeBraces.push({
        start: { x: mx, y: yPurlinCenter, z: 0 },
        end:   { x: mx, y: yPurlinCenter + kingBraceD, z: +kingBraceD },
      })
    }
  }

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
    totalLength: purlinLength,
    rafterSpacing: maxSpacing,
    kneeBraces,
    kingPosts,
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
  /** Total footprint including overhangs (m²) */
  totalFootprint: number
  /** Number of pillars (for ground screws, foundations) */
  pillarCount: number
}

export function computeMetrics(model: StructureModel): StructureMetrics {
  const purlinLength = model.totalLength
  const tieBeamLength = Math.abs(model.tieBeams[0].end.z - model.tieBeams[0].start.z)
  const rafterLen = model.rafters[0].length
  const tanPitch = Math.tan(model.params.pitch * Math.PI / 180)

  // Volume (pillar heights vary: ridge pillars are taller)
  const pillarVol   = model.pillars.reduce((sum, p) => sum + PILLAR_SIZE * PILLAR_SIZE * p.height, 0)
  const basePurVol  = model.basePurlins.length * PURLIN_SIZE * PURLIN_SIZE * purlinLength
  const rs = model.ridgePurlin.width
  const ridgePurVol = rs * rs * purlinLength
  const tieBeamVol  = model.tieBeams.length * PURLIN_SIZE * PURLIN_SIZE * tieBeamLength
  const rafterVol   = model.rafters.reduce((sum, r) =>
    sum + r.width * r.depth * Math.ceil(rafterLen + r.depth * tanPitch), 0)
  // Ridge tie: trapezoid area × width but assume box geometry because of waste during cutting
  const ridgeTieVol = model.ridgeTies.length > 0
    ? model.ridgeTies.length * 2 * model.ridgeTies[0].zHalfBottom * RIDGE_TIE_DEPTH * RIDGE_TIE_WIDTH
    : 0
  const kneeBraceVol = model.kneeBraces.reduce((sum, kb) => {
    const dx = kb.end.x - kb.start.x, dy = kb.end.y - kb.start.y, dz = kb.end.z - kb.start.z
    return sum + KNEE_BRACE_WIDTH * KNEE_BRACE_DEPTH * Math.sqrt(dx * dx + dy * dy + dz * dz)
  }, 0)
  const kingPostVol = model.kingPosts.reduce((sum, kp) => sum + PILLAR_SIZE * PILLAR_SIZE * kp.height, 0)
  const timberVolume = pillarVol + basePurVol + ridgePurVol + tieBeamVol + rafterVol + ridgeTieVol + kneeBraceVol + kingPostVol

  // Surface (perimeter × length, ignoring ends)
  const pillarSurf   = model.pillars.reduce((sum, p) => sum + p.height * (4 * PILLAR_SIZE), 0)
  const basePurSurf  = model.basePurlins.length * purlinLength * 2 * (PURLIN_SIZE + PURLIN_SIZE)
  const ridgePurSurf = purlinLength * 2 * (rs + rs)
  const tieBeamSurf  = model.tieBeams.length * tieBeamLength * 2 * (PURLIN_SIZE + PURLIN_SIZE)
  const rafterSurf   = model.rafters.reduce((sum, r) =>
    sum + rafterLen * (2 * r.width + 2 * r.depth), 0)
  // Ridge tie surface: top + bottom + 2 sloped sides (ignoring ends)
  const cosPitch = Math.cos(model.params.pitch * Math.PI / 180)
  const ridgeTieSurf = model.ridgeTies.length > 0
    ? model.ridgeTies.length * RIDGE_TIE_WIDTH * (
        2 * model.ridgeTies[0].zHalfTop +
        2 * model.ridgeTies[0].zHalfBottom +
        2 * RIDGE_TIE_DEPTH / cosPitch
      )
    : 0
  const kneeBraceSurf = model.kneeBraces.reduce((sum, kb) => {
    const dx = kb.end.x - kb.start.x, dy = kb.end.y - kb.start.y, dz = kb.end.z - kb.start.z
    return sum + Math.sqrt(dx * dx + dy * dy + dz * dz) * (2 * (KNEE_BRACE_WIDTH + KNEE_BRACE_DEPTH))
  }, 0)
  const kingPostSurf = model.kingPosts.reduce((sum, kp) => sum + kp.height * (4 * PILLAR_SIZE), 0)
  const timberSurface = pillarSurf + basePurSurf + ridgePurSurf + tieBeamSurf + rafterSurf + ridgeTieSurf + kneeBraceSurf + kingPostSurf

  // Roof surface: 2 slopes × rafter length × purlin run
  const roofSurface = 2 * rafterLen * purlinLength

  // Total footprint including overhangs
  const { width, length, eavesOverhang, gableOverhang } = model.params
  const totalFootprint = (width + 2 * eavesOverhang) * (length + 2 * gableOverhang)

  return { timberVolume, timberSurface, roofSurface, totalFootprint, pillarCount: model.pillars.length }
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

function buildKneeBraces(pillarXPositions: number[], width: number, needsCenterPillars: boolean): KneeBrace[] {
  const leg = KNEE_BRACE_LENGTH * Math.cos(Math.PI / 4)  // 1/√2 ≈ 0.707
  const zHalf = width / 2 - PILLAR_SIZE / 2  // pillar center z offset
  const yJ = GROUND_SCREW_HEIGHT + PILLAR_HEIGHT + PURLIN_SIZE / 2  // purlin/tie beam center level
  const braces: KneeBrace[] = []

  const cornerXSet = new Set([pillarXPositions[0], pillarXPositions[pillarXPositions.length - 1]])

  for (const xP of pillarXPositions) {
    const isCornerRow = cornerXSet.has(xP)
    const sx = Math.sign(-xP) || 1  // toward center along x

    // ── Side pillar braces (at ±zHalf) ──────────────────────────────────────
    for (const zP of [-zHalf, +zHalf]) {
      const sz = Math.sign(-zP) || 1  // toward center along z

      if (isCornerRow) {
        // Corner: 3 braces — one direction along each axis
        braces.push(
          { start: { x: xP, y: yJ - leg, z: zP }, end: { x: xP, y: yJ, z: zP + sz * leg } },             // Pillar ↔ Tie beam (YZ)
          { start: { x: xP, y: yJ - leg, z: zP }, end: { x: xP + sx * leg, y: yJ, z: zP } },             // Pillar ↔ Purlin (XY)
          { start: { x: xP + sx * leg, y: yJ, z: zP }, end: { x: xP, y: yJ, z: zP + sz * leg } },        // Purlin ↔ Tie beam (XZ)
        )
      } else {
        // Interior row side pillar: 5 braces — purlin extends both ways along X
        braces.push(
          { start: { x: xP, y: yJ - leg, z: zP }, end: { x: xP, y: yJ, z: zP + sz * leg } },             // Pillar ↔ Tie beam (YZ)
        )
        for (const dx of [-1, +1]) {
          braces.push(
            { start: { x: xP, y: yJ - leg, z: zP }, end: { x: xP + dx * leg, y: yJ, z: zP } },           // Pillar ↔ Purlin (XY)
            { start: { x: xP + dx * leg, y: yJ, z: zP }, end: { x: xP, y: yJ, z: zP + sz * leg } },      // Purlin ↔ Tie beam (XZ)
          )
        }
      }
    }

    // ── Center pillar braces (z=0, corner rows only when wide) ──────────────
    if (needsCenterPillars && isCornerRow) {
      for (const dz of [-1, +1]) {
        braces.push(
          { start: { x: xP, y: yJ - leg, z: 0 }, end: { x: xP, y: yJ, z: dz * leg } },                   // Pillar ↔ Tie beam (YZ)
        )
      }
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
  const needsCenterPillar = innerSpan > MAX_UNSUPPORTED_TIE_BEAM_SPAN
  const pillars: Pillar[] = []
  for (let i = 0; i < xPositions.length; i++) {
    const x = xPositions[i]
    for (const z of [-zHalf, +zHalf]) {
      pillars.push({ base: { x, y: GROUND_SCREW_HEIGHT, z }, height: PILLAR_HEIGHT })
    }
    // Ridge pillar at z=0 for corner (end) rows only, extends to ridge purlin bottom
    if (needsCenterPillar && (i === 0 || i === xPositions.length - 1)) {
      pillars.push({ base: { x, y: GROUND_SCREW_HEIGHT, z: 0 }, height: ridgePillarHeight })
    }
  }
  return pillars
}

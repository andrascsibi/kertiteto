/**
 * Pure geometric functions for gable roof calculations.
 * All dimensions in meters. Angles in degrees at the API boundary, radians internally.
 */

import { PILLAR_SIZE } from "./structure"

const DEG = Math.PI / 180

/** Fixed plumb cut height for all bird mouths: keeps 4/5 of 15 cm rafter depth */
export const BIRD_MOUTH_PLUMB_HEIGHT = 0.03

/** Height of the vertical (plumb) face at the eave end of each rafter (m) */
export const EAVE_PLUMB_HEIGHT = 0.06

/** Maximum rafter bay spacing (m) */
export const MAX_RAFTER_SPACING = 0.9

/** Maximum unsupported longitudinal span between pillar inner faces (m) */
export const MAX_UNSUPPORTED_SPAN = 3.5

/** Maximum unsupported tie beam span (cross-sectional) before requiring center pillars (m) */
export const MAX_UNSUPPORTED_TIE_BEAM_SPAN = 4.0

/** Rafter span threshold for switching from 7.5×15 to 10×15 cm cross-section (m) */
export const LONG_RAFTER_LENGTH = 3.0

/** Maximum rafter length (excluding eaves overhang) before structure becomes impractical (m) */
export const MAX_RAFTER_LENGTH = 4.0

/**
 * Maximum building width for a given pitch, so that rafterLength(w, pitch, 0) <= MAX_RAFTER_LENGTH.
 * maxWidth = 2 * MAX_RAFTER_LENGTH * cos(pitch)
 */
export function maxWidthForPitch(pitchDeg: number): number {
  return 2 * MAX_RAFTER_LENGTH * Math.cos(pitchDeg * DEG)
}

/**
 * Maximum pitch (degrees) for a given width, so that rafterLength(w, pitch, 0) <= MAX_RAFTER_LENGTH.
 * maxPitch = acos(width / (2 * MAX_RAFTER_LENGTH))
 */
export function maxPitchForWidth(width: number): number {
  const ratio = width / (2 * MAX_RAFTER_LENGTH)
  if (ratio >= 1) return 0
  return Math.acos(ratio) / DEG
}

export interface BirdMouthGeometry {
  /** Horizontal cut width (m) - perpendicular to rafter axis, sits on purlin */
  seatDepth: number
  /** Vertical cut height (m) - parallel to a plumb line */
  plumbHeight: number
}

/**
 * Ridge height above top of base purlin.
 * H = (width / 2) * tan(pitch)
 */
export function ridgeHeight(width: number, pitchDeg: number): number {
  return (width / 2) * Math.tan(pitchDeg * DEG)
}

/**
 * Rafter length along slope from eave end to ridge.
 * run = half-width + eavesOverhang
 * length = run / cos(pitch)
 */
export function rafterLength(width: number, pitchDeg: number, eavesOverhang: number): number {
  const run = width / 2 + eavesOverhang
  return run / Math.cos(pitchDeg * DEG)
}

/**
 * Number of pillars (always even: 2 per row).
 * Rows are spaced so that the unsupported span between adjacent inner faces
 * never exceeds MAX_UNSUPPORTED_SPAN. Same logic as rafterCount but for pillars.
 */
export function pillarCount(length: number): number {
  const innerSpan = length - 2 * PILLAR_SIZE
  const bays = Math.ceil(innerSpan / MAX_UNSUPPORTED_SPAN)
  return (bays + 1) * 2
}

/**
 * Rafter bay spacing: divides length into equal bays not exceeding MAX_RAFTER_SPACING.
 */
export function rafterSpacing(length: number): number {
  const bays = Math.ceil(length / MAX_RAFTER_SPACING)
  return length / bays
}

/**
 * Number of rafters per slope = number of bays + 1.
 * (Gable rafters are included at both ends.)
 */
export function rafterCount(length: number): number {
  return Math.ceil(length / MAX_RAFTER_SPACING) + 1
}

/**
 * Bird mouth at base purlin (TALP SZELEMEN, 15x15 cm).
 * Plumb cut: fixed at 3 cm (keeps 4/5 of 15 cm rafter depth).
 * Seat depth: determined by pitch — seatDepth = plumbHeight / tan(pitch).
 */
export function birdMouthAtBasePurlin(pitchDeg: number): BirdMouthGeometry {
  return {
    plumbHeight: BIRD_MOUTH_PLUMB_HEIGHT,
    seatDepth: BIRD_MOUTH_PLUMB_HEIGHT / Math.tan(pitchDeg * DEG),
  }
}

/**
 * Bird mouth at ridge purlin (GERINC SZELEMEN, 10x10 cm).
 * Seat depth: fixed at 5 cm (half of 10 cm purlin width).
 * Plumb cut: fixed at 3 cm.
 */
export function birdMouthAtRidgePurlin(_pitchDeg: number): BirdMouthGeometry {
  return {
    seatDepth: 0.05,
    plumbHeight: BIRD_MOUTH_PLUMB_HEIGHT,
  }
}

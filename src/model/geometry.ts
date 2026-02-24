/**
 * Pure geometric functions for gable roof calculations.
 * All dimensions in meters. Angles in degrees at the API boundary, radians internally.
 */

const DEG = Math.PI / 180

/** Fixed plumb cut height for all bird mouths: keeps 4/5 of 15 cm rafter depth */
const BIRD_MOUTH_PLUMB_HEIGHT = 0.03

/** Maximum rafter bay spacing (m) */
const MAX_RAFTER_SPACING = 0.9

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
 * Number of pillars.
 * 4 pillars for length <= 3.5m, 6 for > 3.5m (up to 7m max).
 */
export function pillarCount(length: number): 4 | 6 {
  return length <= 3.5 ? 4 : 6
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

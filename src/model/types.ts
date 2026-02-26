// All linear dimensions in meters unless stated otherwise.

export interface InputParams {
  /** KERESZTIRANYU MERET: outer width of the structure, eave to eave (m) */
  width: number
  /** HOSSZIRANYU MERET: outer length of the structure, gable to gable (m) */
  length: number
  /** Roof pitch in degrees. Default: 25 */
  pitch: number
  /** Horizontal eaves overhang beyond the base purlin (m). Default: 0.5 */
  eavesOverhang: number
  /** Horizontal gable overhang beyond the end rafters (m). Default: 0.3 */
  gableOverhang: number
}

export interface Point3D {
  x: number
  y: number
  z: number
}

export interface Pillar {
  /** Bottom centre of pillar */
  base: Point3D
  height: number
  /** Cross-section: 0.15 x 0.15 m */
}

export interface Purlin {
  start: Point3D
  end: Point3D
  /** Cross-section width x height (m) */
  width: number
  height: number
}

export interface TieBeam {
  /** KOTOGERENDA: horizontal beam connecting the two base purlins at corner pillar positions */
  start: Point3D
  end: Point3D
}

export interface BirdMouth {
  /** Seat cut depth (horizontal, into rafter) */
  seatDepth: number
  /** Plumb cut height (vertical) */
  plumbHeight: number
  /** Position along rafter from lower end (m) */
  distanceFromEave: number
}

export interface Rafter {
  /** Lower end (eave end, after tail cut) */
  eaveEnd: Point3D
  /** Upper end (ridge) */
  ridgeEnd: Point3D
  /** Bird mouth at base purlin */
  birdMouthBase: BirdMouth
  /** Bird mouth at ridge purlin */
  birdMouthRidge: BirdMouth
  /** Length along slope (m) */
  length: number
}

export interface RidgeTie {
  /** KAKASULO: center x position along ridge */
  x: number
  /** Top y of the horizontal surface */
  yTop: number
  /** Bottom y (= yTop - RIDGE_TIE_DEPTH) */
  yBottom: number
  /** Half-width at top in z (narrower) */
  zHalfTop: number
  /** Half-width at bottom in z (wider, sides slope at pitch) */
  zHalfBottom: number
}

export interface KneeBrace {
  /** KONYOKFA / KARPANT: diagonal brace connecting two structural members at a corner */
  start: Point3D
  end: Point3D
}

export interface StructureModel {
  params: InputParams
  /** Ridge height above pillar top (m) */
  ridgeHeight: number
  /** Pillar height from ground to top (m). Fixed: 2.4 m */
  pillarHeight: number
  pillars: Pillar[]
  /** Base purlins: left and right, plus center if ridge pillars present (TALP SZELEMEN) */
  basePurlins: Purlin[]
  /** Ridge purlin (GERINC SZELEMEN) */
  ridgePurlin: Purlin
  /** Tie beams (KOTOGERENDA) */
  tieBeams: TieBeam[]
  /** Ridge ties (KAKASULO / KISFOGOPAR) */
  ridgeTies: RidgeTie[]
  /** All rafters, left slope then right slope */
  rafters: Rafter[]
  /** Rafter spacing along ridge (m) */
  rafterSpacing: number
  /** Corner knee braces (KONYOKFA) */
  kneeBraces: KneeBrace[]
}

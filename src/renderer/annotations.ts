/**
 * Dimension annotations: ground-plane (width & length) and vertical (heights).
 */

import * as THREE from 'three'
import type { StructureModel } from '../model/types'

const ANNOTATION_Y = 0.06   // just above grid (0.002)
const OFFSET_INNER = 0.5     // inner dims: distance from overhang edge
const OFFSET_OUTER = 1.0     // outer dims: further out past inner
const TICK_LENGTH = 0.15     // perpendicular end-tick half-length
const LINE_COLOR = 0xffffff
const V_OFFSET = 0.3         // horizontal offset from gable end for vertical dims

function makeLabel(text: string): THREE.Sprite | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 128
  const ctx = canvas.getContext('2d')!

  // Text
  ctx.font = '700 64px system-ui, -apple-system, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#aaaaaa'
  ctx.fillText(text, canvas.width / 2, canvas.height / 2)

  const texture = new THREE.CanvasTexture(canvas)
  const material = new THREE.SpriteMaterial({ map: texture, sizeAttenuation: true })
  const sprite = new THREE.Sprite(material)
  sprite.scale.set(1.2, 0.3, 1)
  return sprite
}

/** Build a single dimension annotation: two ticks + connecting line + label.
 *  Works for both horizontal (ground) and vertical dimension lines. */
function buildDimension(
  from: THREE.Vector3,
  to: THREE.Vector3,
  tickDir: THREE.Vector3,  // unit vector perpendicular to the dimension line
  label: string,
  labelOffset?: THREE.Vector3, // offset from midpoint for label placement
): THREE.Group {
  const group = new THREE.Group()

  const tickOffset = tickDir.clone().multiplyScalar(TICK_LENGTH)
  const positions = new Float32Array([
    // Tick at 'from'
    from.x - tickOffset.x, from.y - tickOffset.y, from.z - tickOffset.z,
    from.x + tickOffset.x, from.y + tickOffset.y, from.z + tickOffset.z,
    // Tick at 'to'
    to.x - tickOffset.x, to.y - tickOffset.y, to.z - tickOffset.z,
    to.x + tickOffset.x, to.y + tickOffset.y, to.z + tickOffset.z,
    // Connecting line
    from.x, from.y, from.z,
    to.x, to.y, to.z,
  ])

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const mat = new THREE.LineBasicMaterial({ color: LINE_COLOR })
  const lines = new THREE.LineSegments(geo, mat)
  group.add(lines)

  const mid = new THREE.Vector3(
    (from.x + to.x) / 2,
    (from.y + to.y) / 2,
    (from.z + to.z) / 2,
  )
  if (labelOffset) mid.add(labelOffset)
  const sprite = makeLabel(label)
  if (sprite) {
    sprite.position.copy(mid)
    group.add(sprite)
  }

  return group
}

export interface HeightAnnotations {
  /** Y of pillar top (ground screw + pillar height) */
  pillarTopY: number
  /** Y of the highest point of the building (ridge peak incl. roofing stack) */
  peakY: number
}

export function buildAnnotations(model: StructureModel, heights?: HeightAnnotations): THREE.Group {
  const group = new THREE.Group()
  const { width, length, eavesOverhang, gableOverhang } = model.params

  const totalWidth = width + 2 * eavesOverhang
  const totalLength = length + 2 * gableOverhang

  // Inner: pillar-to-pillar width — along Z, in front of building
  const iwx = length / 2 + gableOverhang + OFFSET_INNER
  group.add(buildDimension(
    new THREE.Vector3(iwx, ANNOTATION_Y, -width / 2),
    new THREE.Vector3(iwx, ANNOTATION_Y, width / 2),
    new THREE.Vector3(1, 0, 0),
    `${width.toFixed(1)} m`,
  ))

  // Inner: pillar-to-pillar length — along X, to the side of building
  const ilz = width / 2 + eavesOverhang + OFFSET_INNER
  group.add(buildDimension(
    new THREE.Vector3(-length / 2, ANNOTATION_Y, ilz),
    new THREE.Vector3(length / 2, ANNOTATION_Y, ilz),
    new THREE.Vector3(0, 0, 1),
    `${length.toFixed(1)} m`,
  ))

  // Outer: total width (with eaves overhangs) — further out
  const owx = length / 2 + gableOverhang + OFFSET_OUTER
  group.add(buildDimension(
    new THREE.Vector3(owx, ANNOTATION_Y, -totalWidth / 2),
    new THREE.Vector3(owx, ANNOTATION_Y, totalWidth / 2),
    new THREE.Vector3(1, 0, 0),
    `${totalWidth.toFixed(1)} m`,
  ))

  // Outer: total length (with gable overhangs) — further out
  const olz = width / 2 + eavesOverhang + OFFSET_OUTER
  group.add(buildDimension(
    new THREE.Vector3(-totalLength / 2, ANNOTATION_Y, olz),
    new THREE.Vector3(totalLength / 2, ANNOTATION_Y, olz),
    new THREE.Vector3(0, 0, 1),
    `${totalLength.toFixed(1)} m`,
  ))

  // ── Vertical height dimensions (at gable end, in the Z=0 plane) ────────────
  if (heights) {
    const vx = length / 2 +0.01//+ gableOverhang //+ V_OFFSET
    const vz = - (width / 2 + eavesOverhang + V_OFFSET);
    const labelOff = new THREE.Vector3(0.3, 0, 0)  // push label away from building

    // Pillar height: ground → pillar top
    group.add(buildDimension(
      new THREE.Vector3(vx, 0, vz),
      new THREE.Vector3(vx, heights.pillarTopY, vz),
      new THREE.Vector3(0, 0, 1),  // tick perpendicular: along Z
      `${heights.pillarTopY.toFixed(2)} m`,
      labelOff,
    ))

    // Total height: ground → peak
    group.add(buildDimension(
      new THREE.Vector3(vx, 0, vz - V_OFFSET),
      new THREE.Vector3(vx, heights.peakY, vz - V_OFFSET),
      new THREE.Vector3(0, 0, 1),
      `${heights.peakY.toFixed(2)} m`,
      labelOff,
    ))
  }

  return group
}

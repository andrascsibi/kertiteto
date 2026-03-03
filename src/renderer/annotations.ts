/**
 * Ground-plane dimension annotations (width & length lines with labels).
 */

import * as THREE from 'three'
import type { StructureModel } from '../model/types'

const ANNOTATION_Y = 0.004   // just above grid (0.002)
const OFFSET = 0.5           // distance from building edge (past overhang)
const TICK_LENGTH = 0.15     // perpendicular end-tick half-length
const LINE_COLOR = 0xffffff

function makeLabel(text: string): THREE.Sprite | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 128
  const ctx = canvas.getContext('2d')!

  // Text
  ctx.font = '700 48px system-ui, -apple-system, sans-serif'
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

/** Build a single dimension annotation: two ticks + connecting line + label. */
function buildDimension(
  from: THREE.Vector3,
  to: THREE.Vector3,
  tickDir: THREE.Vector3,  // unit vector perpendicular to the dimension line
  label: string,
): THREE.Group {
  const group = new THREE.Group()

  // Line vertices: [tick1-start, tick1-end, tick2-start, tick2-end, line-start, line-end]
  const tickOffset = tickDir.clone().multiplyScalar(TICK_LENGTH)
  const positions = new Float32Array([
    // Tick at 'from'
    from.x - tickOffset.x, from.y, from.z - tickOffset.z,
    from.x + tickOffset.x, from.y, from.z + tickOffset.z,
    // Tick at 'to'
    to.x - tickOffset.x, to.y, to.z - tickOffset.z,
    to.x + tickOffset.x, to.y, to.z + tickOffset.z,
    // Connecting line
    from.x, from.y, from.z,
    to.x, to.y, to.z,
  ])

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const mat = new THREE.LineBasicMaterial({ color: LINE_COLOR })
  const lines = new THREE.LineSegments(geo, mat)
  group.add(lines)

  // Label at midpoint, slightly above ground
  const sprite = makeLabel(label)
  if (sprite) {
    sprite.position.set(
      (from.x + to.x) / 2,
      0.05,
      (from.z + to.z) / 2,
    )
    group.add(sprite)
  }

  return group
}

export function buildAnnotations(model: StructureModel): THREE.Group {
  const group = new THREE.Group()
  const { width, length, eavesOverhang, gableOverhang } = model.params

  // Width annotation — along Z axis, placed in front of building (positive X)
  const wx = length / 2 + gableOverhang + OFFSET
  group.add(buildDimension(
    new THREE.Vector3(wx, ANNOTATION_Y, -width / 2),
    new THREE.Vector3(wx, ANNOTATION_Y, width / 2),
    new THREE.Vector3(1, 0, 0),  // ticks run along X
    `${width.toFixed(1)} m`,
  ))

  // Length annotation — along X axis, placed to the side of building (positive Z)
  const lz = width / 2 + eavesOverhang + OFFSET
  group.add(buildDimension(
    new THREE.Vector3(-length / 2, ANNOTATION_Y, lz),
    new THREE.Vector3(length / 2, ANNOTATION_Y, lz),
    new THREE.Vector3(0, 0, 1),  // ticks run along Z
    `${length.toFixed(1)} m`,
  ))

  return group
}

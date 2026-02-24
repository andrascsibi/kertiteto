import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { StructureModel } from '../model/types'
import { buildRoofMeshes } from './roof'

export interface SceneHandle {
  updateModel(model: StructureModel): void
  dispose(): void
}

export function createScene(container: HTMLElement): SceneHandle {
  // ── Renderer ────────────────────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  container.appendChild(renderer.domElement)

  // ── Scene ───────────────────────────────────────────────────────────────────
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0xdce8f0)
  scene.fog = new THREE.FogExp2(0xdce8f0, 0.025)

  // ── Camera ──────────────────────────────────────────────────────────────────
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
  camera.position.set(9, 6, 7)

  // ── Controls ────────────────────────────────────────────────────────────────
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.target.set(0, 1.5, 0)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.minDistance = 2
  controls.maxDistance = 30
  controls.update()

  // ── Lights ──────────────────────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0xffffff, 0.55))

  const sun = new THREE.DirectionalLight(0xfff5d0, 1.1)
  sun.position.set(7, 14, 5)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.near = 0.5
  sun.shadow.camera.far = 50
  sun.shadow.camera.left  = -12
  sun.shadow.camera.right =  12
  sun.shadow.camera.top   =  12
  sun.shadow.camera.bottom = -12
  scene.add(sun)

  // Soft fill from the opposite side
  const fill = new THREE.DirectionalLight(0xc0d8ff, 0.35)
  fill.position.set(-5, 5, -5)
  scene.add(fill)

  // ── Ground ──────────────────────────────────────────────────────────────────
  const groundGeo = new THREE.PlaneGeometry(40, 40)
  const groundMat = new THREE.MeshLambertMaterial({ color: 0xc4d49a })
  const ground = new THREE.Mesh(groundGeo, groundMat)
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  const grid = new THREE.GridHelper(20, 20, 0xaabbaa, 0xbbccbb)
  grid.position.y = 0.002
  scene.add(grid)

  // ── Model group ─────────────────────────────────────────────────────────────
  let modelGroup = new THREE.Group()
  scene.add(modelGroup)

  // ── Resize ──────────────────────────────────────────────────────────────────
  function resize(): void {
    const w = container.clientWidth
    const h = container.clientHeight
    renderer.setSize(w, h)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  resize()
  const resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(container)

  // ── Animation loop ───────────────────────────────────────────────────────────
  let animId: number
  function animate(): void {
    animId = requestAnimationFrame(animate)
    controls.update()
    renderer.render(scene, camera)
  }
  animate()

  // ── Public API ───────────────────────────────────────────────────────────────
  return {
    updateModel(model: StructureModel): void {
      disposeGroup(modelGroup)
      scene.remove(modelGroup)
      modelGroup = buildRoofMeshes(model)
      scene.add(modelGroup)
      // Keep camera target at mid-pillar height
      controls.target.set(0, model.pillarHeight / 2, 0)
    },

    dispose(): void {
      cancelAnimationFrame(animId)
      resizeObserver.disconnect()
      disposeGroup(modelGroup)
      groundGeo.dispose()
      groundMat.dispose()
      renderer.dispose()
      container.removeChild(renderer.domElement)
    },
  }
}

function disposeGroup(group: THREE.Group): void {
  group.traverse(child => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose()
      // Materials are shared module-level constants — do not dispose here.
    }
  })
  group.clear()
}

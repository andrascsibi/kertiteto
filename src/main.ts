import { buildStructure, DEFAULTS } from './model/structure'
import { pillarCount, rafterCount } from './model/geometry'
import { createScene } from './renderer/scene'

// ── DOM refs ───────────────────────────────────────────────────────────────────
const viewport = document.getElementById('viewport')!
const info     = document.getElementById('info')!

const inpWidth  = document.getElementById('inp-width')  as HTMLInputElement
const inpLength = document.getElementById('inp-length') as HTMLInputElement
const inpPitch  = document.getElementById('inp-pitch')  as HTMLInputElement
const inpEaves  = document.getElementById('inp-eaves')  as HTMLInputElement
const inpGable  = document.getElementById('inp-gable')  as HTMLInputElement

const valWidth  = document.getElementById('val-width')!
const valLength = document.getElementById('val-length')!
const valPitch  = document.getElementById('val-pitch')!
const valEaves  = document.getElementById('val-eaves')!
const valGable  = document.getElementById('val-gable')!

// ── Scene ──────────────────────────────────────────────────────────────────────
const scene = createScene(viewport)

// ── State + update ─────────────────────────────────────────────────────────────
function update(): void {
  const params = {
    width:         parseFloat(inpWidth.value),
    length:        parseFloat(inpLength.value),
    pitch:         parseFloat(inpPitch.value),
    eavesOverhang: parseFloat(inpEaves.value),
    gableOverhang: parseFloat(inpGable.value),
  }

  // Update display values
  valWidth.textContent  = `${params.width.toFixed(1)} m`
  valLength.textContent = `${params.length.toFixed(1)} m`
  valPitch.textContent  = `${params.pitch}°`
  valEaves.textContent  = `${params.eavesOverhang.toFixed(2)} m`
  valGable.textContent  = `${params.gableOverhang.toFixed(2)} m`

  const model = buildStructure(params)
  scene.updateModel(model)

  // Info badge
  const nPillars = pillarCount(params.length)
  const nRafters = rafterCount(params.length)
  info.innerHTML =
    `<strong>${params.width.toFixed(1)} × ${params.length.toFixed(1)} m</strong> · ${params.pitch}°<br>` +
    `${nPillars} oszlop · ${nRafters * 2} szarufa<br>` +
    `gerincmagasság: ${model.ridgeHeight.toFixed(2)} m`
}

// ── Wire up sliders ────────────────────────────────────────────────────────────
for (const inp of [inpWidth, inpLength, inpPitch, inpEaves, inpGable]) {
  inp.addEventListener('input', update)
}

// ── Initial render with defaults ───────────────────────────────────────────────
inpWidth.value  = String(DEFAULTS.width)
inpLength.value = String(DEFAULTS.length)
inpPitch.value  = String(DEFAULTS.pitch)
inpEaves.value  = String(DEFAULTS.eavesOverhang)
inpGable.value  = String(DEFAULTS.gableOverhang)
update()

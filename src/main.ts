import { buildStructure, computeMetrics, DEFAULTS } from './model/structure'
import { pillarCount, rafterCount } from './model/geometry'
import { fetchPrices, type PriceTable } from './model/prices'
import { createScene } from './renderer/scene'

// ── Hash params ──────────────────────────────────────────────────────────────
function parseHash(): Record<string, string> {
  const pairs: Record<string, string> = {}
  for (const part of window.location.hash.replace('#', '').split('&')) {
    const [k, v] = part.split('=')
    if (k && v) pairs[k] = v
  }
  return pairs
}

const hashParams = parseHash()
function hashFloat(key: string, fallback: number): number {
  const v = parseFloat(hashParams[key])
  return Number.isFinite(v) ? v : fallback
}

// ── DOM refs ───────────────────────────────────────────────────────────────────
const viewport = document.getElementById('viewport')!
const info     = document.getElementById('info')!
const debug    = document.getElementById('debug')!
const pricing  = document.getElementById('pricing')!
const devMode  = hashParams['dev'] === 'true'
if (devMode) debug.style.display = 'block'

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

// ── Pricing ────────────────────────────────────────────────────────────────────
let prices: PriceTable | null = null
pricing.innerHTML = '<p class="price-loading">Árak betöltése…</p>'
fetchPrices()
  .then(p => { prices = p; update() })
  .catch(() => { pricing.innerHTML = '<p class="price-loading">Árak nem elérhetők</p>' })

function formatHUF(amount: number): string {
  return Math.round(amount).toLocaleString('hu-HU') + ' Ft'
}

function computePrice(prices: PriceTable, timberVolume: number, roofSurface: number): number {
  const materialPerM3 =
    (prices['fureszaru']?.price ?? 0) +
    (prices['gyalulas']?.price ?? 0) +
    (prices['gyartas']?.price ?? 0)
  const installPerM2 = prices['szereles']?.price ?? 0
  return materialPerM3 * timberVolume + installPerM2 * roofSurface
}

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

  const m = computeMetrics(model)

  // Info badge
  const nPillars = pillarCount(params.length)
  const nRafters = rafterCount(params.length)
  info.innerHTML =
    `<strong>${params.width.toFixed(1)} × ${params.length.toFixed(1)} m</strong> · ${params.pitch}°<br>` +
    `${nPillars} oszlop · ${nRafters * 2} szarufa<br>` +
    `gerincmagasság: ${model.ridgeHeight.toFixed(2)} m`

  // Pricing panel
  if (prices) {
    const total = computePrice(prices, m.timberVolume, m.roofSurface)
    const unitPrice = total / m.totalFootprint
    pricing.innerHTML =
      `<p class="section-title">Becsült ár (bruttó)</p>` +
      `<p class="price-total">${formatHUF(total)}</p>` +
      `<p class="price-unit">${formatHUF(unitPrice)} / m²</p>`
  }

  // Debug panel
  if (devMode) {
    debug.innerHTML =
      `szaruhossz: ${model.rafters[0].length.toFixed(2)} m<br>` +
      `faanyag: ${m.timberVolume.toFixed(2)} m³<br>` +
      `felület: ${m.timberSurface.toFixed(1)} m²<br>` +
      `tető: ${m.roofSurface.toFixed(1)} m²<br>` +
      `alapterület: ${m.totalFootprint.toFixed(1)} m²`
  }
}

// ── Wire up sliders ────────────────────────────────────────────────────────────
for (const inp of [inpWidth, inpLength, inpPitch, inpEaves, inpGable]) {
  inp.addEventListener('input', update)
}

// ── Initial values from hash params or defaults ─────────────────────────────
inpWidth.value  = String(hashFloat('w', DEFAULTS.width))
inpLength.value = String(hashFloat('h', DEFAULTS.length))
inpPitch.value  = String(hashFloat('p', DEFAULTS.pitch))
inpEaves.value  = String(hashFloat('e', DEFAULTS.eavesOverhang))
inpGable.value  = String(hashFloat('g', DEFAULTS.gableOverhang))
update()

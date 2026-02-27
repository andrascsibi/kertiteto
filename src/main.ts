import { buildStructure, computeMetrics, DEFAULTS, type StructureMetrics } from './model/structure'
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

const chkLamberia = document.getElementById('chk-lamberia') as HTMLInputElement
const chkMembrane = document.getElementById('chk-membrane') as HTMLInputElement
const chkRoofing  = document.getElementById('chk-roofing')  as HTMLInputElement
const costLamberia = document.getElementById('cost-lamberia')!
const costMembrane = document.getElementById('cost-membrane')!
const costRoofing  = document.getElementById('cost-roofing')!

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

interface PriceLineItem {
  label: string
  unitPrice: number
  unit: string
  quantity: number
  subtotal: number
}

/** Which price entries to include and how to compute quantity */
const PRICE_ITEMS: { id: string, qty: (m: StructureMetrics) => number }[] = [
  { id: 'fureszaru',  qty: m => m.timberVolume },
  { id: 'gyalulas',   qty: m => m.timberVolume },
  { id: 'gyartas',    qty: m => m.timberVolume },
  { id: 'szereles',   qty: m => m.timberVolume  },
]

function computePriceBreakdown(prices: PriceTable, metrics: StructureMetrics): { items: PriceLineItem[], total: number } {
  const items: PriceLineItem[] = []
  let total = 0
  for (const { id, qty } of PRICE_ITEMS) {
    const entry = prices[id]
    if (!entry) continue
    const quantity = qty(metrics)
    const subtotal = entry.price * quantity
    items.push({ label: id, unitPrice: entry.price, unit: entry.unit, quantity, subtotal })
    total += subtotal
  }
  return { items, total }
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

  // Roofing options — always show cost, only add to total when checked
  const ROOFING_OPTIONS = [
    { chk: chkLamberia, costEl: costLamberia, priceKey: 'lamberia' },
    { chk: chkMembrane, costEl: costMembrane, priceKey: 'folia' },
    { chk: chkRoofing,  costEl: costRoofing,  priceKey: 'lemez' },
  ] as const

  let optionsTotal = 0
  for (const { chk, costEl, priceKey } of ROOFING_OPTIONS) {
    const entry = prices?.[priceKey]
    if (!entry) { costEl.textContent = ''; continue }
    const cost = entry.price * m.roofSurface
    costEl.textContent = `+ ${formatHUF(cost)}`
    if (chk.checked) optionsTotal += cost
  }

  // Pricing panel
  if (prices) {
    const { items, total: baseTotal } = computePriceBreakdown(prices, m)
    const total = baseTotal + optionsTotal
    const unitPrice = total / m.totalFootprint
    pricing.innerHTML =
      `<p class="section-title">Becsült ár (bruttó)</p>` +
      `<p class="price-total">${formatHUF(total)}</p>` +
      `<p class="price-unit">${formatHUF(unitPrice)} / m²</p>`

    // Debug: line item breakdown
    if (devMode) {
      const lines = items.map(i =>
        `${i.label}: ${i.quantity.toFixed(2)} ${i.unit} × ${formatHUF(i.unitPrice)} = ${formatHUF(i.subtotal)}`
      ).join('<br>')
      debug.innerHTML =
        `szaruhossz: ${model.rafters[0].length.toFixed(2)} m<br>` +
        `faanyag: ${m.timberVolume.toFixed(2)} m³<br>` +
        `fa felület: ${m.timberSurface.toFixed(1)} m²<br>` +
        `héj felület: ${m.roofSurface.toFixed(1)} m²<br>` +
        `alapterület: ${m.totalFootprint.toFixed(1)} m²<br>` +
        `<br>${lines}<br>összesen: ${formatHUF(total)}`
    }
  } else if (devMode) {
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
for (const chk of [chkLamberia, chkMembrane, chkRoofing]) {
  chk.addEventListener('change', update)
}

// ── Initial values from hash params or defaults ─────────────────────────────
inpWidth.value  = String(hashFloat('w', DEFAULTS.width))
inpLength.value = String(hashFloat('h', DEFAULTS.length))
inpPitch.value  = String(hashFloat('p', DEFAULTS.pitch))
inpEaves.value  = String(hashFloat('e', DEFAULTS.eavesOverhang))
inpGable.value  = String(hashFloat('g', DEFAULTS.gableOverhang))
update()

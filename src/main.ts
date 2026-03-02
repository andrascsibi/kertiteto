import { buildStructure, computeMetrics, DEFAULTS, type StructureMetrics } from './model/structure'
import { fetchPrices, type PriceTable } from './model/prices'
import { buildRoofing, counterBattenTotalLength, roofBattenTotalLength, flashingTotalSurface } from './model/roofing'
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
function hashBool(key: string, fallback: boolean): boolean {
  const v = hashParams[key]
  if (v === '0') return false
  if (v === '1') return true
  return fallback
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

const ctaButton     = document.getElementById('cta-button') as HTMLButtonElement
const quoteModal    = document.getElementById('quote-modal')!
const modalSummary  = document.getElementById('modal-summary')!
const modalFormView = document.getElementById('modal-form-view')!
const modalSuccess  = document.getElementById('modal-success-view')!
const hiddenConfig  = document.getElementById('hidden-config') as HTMLInputElement
const hiddenPrice   = document.getElementById('hidden-price') as HTMLInputElement
const hiddenUrl     = document.getElementById('hidden-url') as HTMLInputElement
const quoteForm     = document.getElementById('quote-form') as HTMLFormElement
const modalCancel   = document.getElementById('modal-cancel')!
const modalClose    = document.getElementById('modal-close')!

// ── Scene ──────────────────────────────────────────────────────────────────────
const scene = createScene(viewport)

// ── Pricing ────────────────────────────────────────────────────────────────────
let prices: PriceTable | null = null
pricing.innerHTML = '<p class="price-loading">Árak betöltése…</p>'
fetchPrices()
  .then(p => { prices = p; update() })
  .catch(() => { pricing.innerHTML = '<p class="price-loading error">Árak nem elérhetők</p>' })

function formatHUF(amount: number): string {
  return Math.round(amount).toLocaleString('hu-HU') + ' Ft'
}

interface PriceLineItem {
  label: string
  unitPrice: number
  unit: string
  quantity: number
  subtotal: number
  category: string
}

const CATEGORY_EMOJI: Record<string, string> = {
  anyag: '🪵',
  muhely: '🪚',
  helyszin: '🔨',
}

/** Which price entries to include and how to compute quantity */
const PRICE_ITEMS: { id: string, qty: (m: StructureMetrics) => number }[] = [
  { id: 'fureszaru',      qty: m => m.timberVolume },
  { id: 'gyalulas',       qty: m => m.timberVolume },
  { id: 'gyartas',        qty: m => m.timberVolume },
  { id: 'lazur',           qty: m => m.timberSurface },
  { id: 'feluletkezeles',  qty: m => m.timberSurface },
  { id: 'szereles',       qty: m => m.timberVolume  },
]

function computePriceBreakdown(prices: PriceTable, metrics: StructureMetrics): { items: PriceLineItem[], total: number } {
  const items: PriceLineItem[] = []
  let total = 0
  for (const { id, qty } of PRICE_ITEMS) {
    const entry = prices[id]
    if (!entry) continue
    const quantity = qty(metrics)
    const subtotal = entry.price * quantity
    items.push({ label: id, unitPrice: entry.price, unit: entry.unit, quantity, subtotal, category: entry.category })
    total += subtotal
  }
  return { items, total }
}

// ── State + update ─────────────────────────────────────────────────────────────
let lastTotal = 0
let lastConfigSummary = ''

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

  // Sync URL hash — only include non-default values to keep URL clean
  const hashParts: string[] = []
  if (params.width         !== DEFAULTS.width)         hashParts.push(`w=${params.width.toFixed(1)}`)
  if (params.length        !== DEFAULTS.length)        hashParts.push(`l=${params.length.toFixed(1)}`)
  if (params.pitch         !== DEFAULTS.pitch)         hashParts.push(`p=${params.pitch}`)
  if (params.eavesOverhang !== DEFAULTS.eavesOverhang) hashParts.push(`e=${params.eavesOverhang.toFixed(2)}`)
  if (params.gableOverhang !== DEFAULTS.gableOverhang) hashParts.push(`g=${params.gableOverhang.toFixed(2)}`)
  if (!chkLamberia.checked) hashParts.push('lb=0')
  if (!chkMembrane.checked) hashParts.push('mb=0')
  if (!chkRoofing.checked)  hashParts.push('rf=0')
  if (devMode) hashParts.push('dev=true')
  history.replaceState(null, '', hashParts.length ? '#' + hashParts.join('&') : location.pathname)

  const model = buildStructure(params)

  const m = computeMetrics(model)
  // Always build with all options enabled so cost previews include everything
  const roofing = buildRoofing(model, { lamberia: true, membrane: true, roofing: true })
  // Build roofing model with current checkbox state for rendering
  const renderRoofing = buildRoofing(model, { lamberia: chkLamberia.checked, membrane: chkMembrane.checked, roofing: chkRoofing.checked })
  scene.updateModel(model, { lamberia: chkLamberia.checked, membrane: chkMembrane.checked, roofing: chkRoofing.checked, roofingModel: renderRoofing })
  const cbTotalLen = counterBattenTotalLength(roofing)
  const rbTotalLen = roofBattenTotalLength(roofing)
  const flashingSurface = flashingTotalSurface(roofing)

  // Info badge
  info.innerHTML =
    `<strong>${params.width.toFixed(1)} × ${params.length.toFixed(1)} m</strong> · ${params.pitch}°<br>` +
    `alapterület: ${m.totalFootprint.toFixed(1)} m²<br>` +
    `tető felület: ${m.roofSurface.toFixed(1)} m²`

  // Roofing options — always show cost, only add to total when checked
  const ROOFING_OPTIONS = [
    { chk: chkLamberia, costEl: costLamberia, items: [
      { key: 'lamberia', qty: m.roofSurface },
      { key: 'lamberiazas', qty: m.roofSurface },
    ]},
    { chk: chkMembrane, costEl: costMembrane, items: [
      { key: 'folia', qty: m.roofSurface },
      { key: 'foliazas', qty: m.roofSurface },
      { key: 'ellenlec', qty: cbTotalLen },
    ]},
    { chk: chkRoofing,  costEl: costRoofing, items: [
      { key: 'lemez', qty: m.roofSurface },
      { key: 'tetolec', qty: rbTotalLen },
      { key: 'lecezes', qty: m.roofSurface },
      { key: 'lemezeles', qty: m.roofSurface },
      { key: 'badog', qty: flashingSurface },
      { key: 'badogozas', qty: flashingSurface },
    ]},
  ]

  let optionsTotal = 0
  const optionItems: PriceLineItem[] = []
  for (const { chk, costEl, items } of ROOFING_OPTIONS) {
    let cost = 0
    let hasAny = false
    for (const { key, qty } of items) {
      const entry = prices?.[key]
      if (!entry) continue
      hasAny = true
      const subtotal = entry.price * qty
      cost += subtotal
      if (chk.checked) {
        optionItems.push({ label: key, unitPrice: entry.price, unit: entry.unit, quantity: qty, subtotal, category: entry.category })
      }
    }
    if (!hasAny) { costEl.textContent = ''; continue }
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

    // Store for modal
    lastTotal = total
    const opts = [
      chkLamberia.checked && 'lambéria',
      chkMembrane.checked && 'alátét héjazat',
      chkRoofing.checked  && 'lemez fedés',
    ].filter(Boolean).join(', ')
    lastConfigSummary =
      `${params.width.toFixed(1)} × ${params.length.toFixed(1)} m · ${params.pitch}°` +
      (opts ? ` · ${opts}` : '')
    ctaButton.disabled = false

    // Debug: line item breakdown
    if (devMode) {
      const allItems = [...items, ...optionItems]
      const lines = allItems.map(i => {
        const emoji = CATEGORY_EMOJI[i.category] ?? '❓'
        return `${emoji} ${i.label}: ${i.quantity.toFixed(2)} ${i.unit} × ${formatHUF(i.unitPrice)} = ${formatHUF(i.subtotal)}`
      }).join('<br>')
      debug.innerHTML =
        `szaruhossz: ${model.rafters[0].length.toFixed(2)} m<br>` +
        `faanyag: ${m.timberVolume.toFixed(2)} m³<br>` +
        `fa felület: ${m.timberSurface.toFixed(1)} m²<br>` +
        `héj felület: ${m.roofSurface.toFixed(1)} m²<br>` +
        `alapterület: ${m.totalFootprint.toFixed(1)} m²<br>` +
        `<br>${lines}<br>` +
        Object.entries(CATEGORY_EMOJI).map(([cat, emoji]) => {
          const sum = allItems.filter(i => i.category === cat).reduce((s, i) => s + i.subtotal, 0)
          return `${emoji} ${cat}: ${formatHUF(sum)}`
        }).join('<br>') +
        `<br>összesen: ${formatHUF(total)}`
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

// ── Quote modal ─────────────────────────────────────────────────────────────
function openModal(): void {
  modalSummary.innerHTML =
    `<strong>${lastConfigSummary}</strong><br>` +
    `Becsült ár: <strong>~${formatHUF(lastTotal)}</strong>`
  hiddenConfig.value = lastConfigSummary
  hiddenPrice.value = formatHUF(lastTotal)
  hiddenUrl.value = window.location.href
  modalFormView.style.display = ''
  modalSuccess.style.display = 'none'
  quoteModal.classList.add('open')
}

function closeModal(): void {
  quoteModal.classList.remove('open')
}

ctaButton.addEventListener('click', openModal)
modalCancel.addEventListener('click', closeModal)
modalClose.addEventListener('click', closeModal)
quoteModal.addEventListener('click', (e) => {
  if (e.target === quoteModal) closeModal()
})

quoteForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  const submitBtn = quoteForm.querySelector('.btn-submit') as HTMLButtonElement
  submitBtn.disabled = true
  submitBtn.textContent = 'Küldés…'
  try {
    const formData = new FormData(quoteForm)
    await fetch(quoteForm.action, { method: 'POST', body: formData })
    modalFormView.style.display = 'none'
    modalSuccess.style.display = ''
    quoteForm.reset()
  } catch {
    submitBtn.disabled = false
    submitBtn.textContent = 'Árajánlat kérése'
    alert('Hiba történt a küldés során. Kérjük próbálja újra!')
  }
})

// ── Initial values from hash params or defaults ─────────────────────────────
inpWidth.value  = String(hashFloat('w', DEFAULTS.width))
inpLength.value = String(hashFloat('l', DEFAULTS.length))
inpPitch.value  = String(hashFloat('p', DEFAULTS.pitch))
inpEaves.value  = String(hashFloat('e', DEFAULTS.eavesOverhang))
inpGable.value  = String(hashFloat('g', DEFAULTS.gableOverhang))
chkLamberia.checked = hashBool('lb', true)
chkMembrane.checked = hashBool('mb', true)
chkRoofing.checked  = hashBool('rf', true)

// Auto-open advanced section if any advanced param was customised in the URL
const advanced = document.getElementById('advanced') as HTMLDetailsElement
if ('p' in hashParams || 'e' in hashParams || 'g' in hashParams) {
  advanced.open = true
}

update()

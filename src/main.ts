import { buildStructure, computeMetrics, DEFAULTS, type StructureMetrics } from './model/structure'
import { maxWidthForPitch, maxPitchForWidth } from './model/geometry'
import { fetchPrices, type PriceTable } from './model/prices'
import { buildRoofing, counterBattenTotalLength, roofBattenTotalLength, flashingTotalSurface } from './model/roofing'
import { createScene } from './renderer/scene'
import { setMetalAppearance, setTimberColor } from './renderer/roof'

// ── Hash params ──────────────────────────────────────────────────────────────
// If hash is a plain anchor (no '='), scroll to that section on load
const initialHash = window.location.hash.replace('#', '')
const anchorTarget = initialHash && !initialHash.includes('=') ? initialHash : null

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
const copyBtn = document.getElementById('copy-prices') as HTMLButtonElement
let lastDebugItems: { label: string; quantity: number; unit: string; unitPrice: number; subtotal: number; category: string }[] = []
if (devMode) {
  debug.style.display = 'block'
  copyBtn.style.display = 'block'
  copyBtn.addEventListener('click', () => {
    if (!lastDebugItems.length) return
    const header = 'label\tqty\tunit\tunit_price\tsubtotal\tcategory'
    const rows = lastDebugItems.map(i =>
      `${i.label}\t${i.quantity}\t${i.unit}\t${i.unitPrice}\t${i.subtotal}\t${i.category}`
    )
    navigator.clipboard.writeText([header, ...rows].join('\n')).then(() => {
      copyBtn.textContent = 'Copied!'
      setTimeout(() => { copyBtn.textContent = 'Copy prices' }, 1000)
    })
  })
}

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
const costLamberia  = document.getElementById('cost-lamberia')!
const costMembrane  = document.getElementById('cost-membrane')!
const costRoofing   = document.getElementById('cost-roofing')!
const clampWarningWidth = document.getElementById('clamp-warning-width')!
const clampWarningPitch = document.getElementById('clamp-warning-pitch')!

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

function formatHUF1k(amount: number): string {
  return (Math.ceil(amount / 1000) * 1000).toLocaleString('hu-HU') + ' Ft'
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
  { id: 'szallitas',      qty: () => 1 },
  { id: 'talajcsavar',    qty: m => m.pillarCount },
  { id: 'alapozas',       qty: m => m.pillarCount },
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
let lastChangedSlider: 'width' | 'pitch' | null = null

function update(): void {
  let width = parseFloat(inpWidth.value)
  let pitch = parseFloat(inpPitch.value)

  // Clamp width↔pitch so rafter length (excluding overhang) stays ≤ 4 m
  // Warning shown under the slider being ADJUSTED (not the one being constrained)
  clampWarningWidth.textContent = ''
  clampWarningPitch.textContent = ''
  if (lastChangedSlider === 'pitch') {
    const mw = maxWidthForPitch(pitch)
    if (width > mw) {
      width = Math.floor(mw * 10) / 10  // round down to slider step (0.1)
      inpWidth.value = String(width)
      clampWarningPitch.textContent = `Szélesség ${width.toFixed(1)} m-re korlátozva (szarufák max. 4 m)`
    }
  } else {
    const mp = maxPitchForWidth(width)
    if (pitch > mp) {
      pitch = Math.floor(mp)  // round down to slider step (1°)
      inpPitch.value = String(pitch)
      clampWarningWidth.textContent = `Hajlásszög ${pitch}°-ra korlátozva (szarufák max. 4 m)`
    }
  }

  const params = {
    width,
    length:        parseFloat(inpLength.value),
    pitch,
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
  if (selectedRal !== '8004' || selectedFinish !== 'matt') {
    hashParts.push(`c=${selectedRal}${selectedFinish === 'matt' ? 'm' : 'f'}`)
  }
  if (selectedTimber !== DEFAULT_TIMBER) {
    hashParts.push(`t=${selectedTimber}`)
  }
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
      { key: 'lazur', qty: m.roofSurface * 1.5, label: 'lamberia lazur', category: 'anyag' as const },
      { key: 'feluletkezeles', qty: m.roofSurface * 1.5, label: 'lamberia lazurozas', category: 'muhely' as const },
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
    for (const item of items) {
      const entry = prices?.[item.key]
      if (!entry) continue
      hasAny = true
      const subtotal = entry.price * item.qty
      cost += subtotal
      if (chk.checked) {
        optionItems.push({ label: item.label ?? item.key, unitPrice: entry.price, unit: entry.unit, quantity: item.qty, subtotal, category: item.category ?? entry.category })
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
      `<p class="price-total">${formatHUF1k(total)}</p>` +
      `<p class="price-unit">${formatHUF(unitPrice)} / m²</p>`

    // Store for modal
    lastTotal = total
    const timberName = TIMBER_COLORS.find(c => c.id === selectedTimber)!.name
    const opts = [
      `lazúr: ${timberName}`,
      chkLamberia.checked && 'lambéria',
      chkMembrane.checked && 'alátét héjazat',
      chkRoofing.checked  && `lemez fedés (RAL ${selectedRal}, ${selectedFinish === 'matt' ? 'matt' : 'fényes'})`,
    ].filter(Boolean).join(', ')
    lastConfigSummary =
      `${params.width.toFixed(1)} × ${params.length.toFixed(1)} m · ${params.pitch}°` +
      (opts ? ` · ${opts}` : '')
    ctaButton.disabled = false

    // Debug: line item breakdown
    if (devMode) {
      const allItems = [...items, ...optionItems]
      lastDebugItems = allItems
      const rows = allItems.map(i => {
        const emoji = CATEGORY_EMOJI[i.category] ?? '❓'
        return `<tr><td>${emoji}</td><td>${i.label}</td><td class="r">${i.quantity.toFixed(2)} ${i.unit}</td><td class="r">${formatHUF(i.unitPrice)}</td><td class="r">${formatHUF(i.subtotal)}</td></tr>`
      }).join('')
      const catRows = Object.entries(CATEGORY_EMOJI).map(([cat, emoji]) => {
        const sum = allItems.filter(i => i.category === cat).reduce((s, i) => s + i.subtotal, 0)
        return `<tr><td>${emoji}</td><td colspan="3">${cat}</td><td class="r">${formatHUF(sum)}</td></tr>`
      }).join('')
      debug.innerHTML =
        `szaruhossz: ${model.rafters[0].length.toFixed(2)} m · ` +
        `faanyag: ${m.timberVolume.toFixed(2)} m³ · ` +
        `fa felület: ${m.timberSurface.toFixed(1)} m² · ` +
        `<table>${rows}` +
        `<tr class="sep"><td colspan="5"></td></tr>` +
        `${catRows}` +
        `<tr class="total"><td></td><td colspan="3">összesen</td><td class="r">${formatHUF(total)}</td></tr>` +
        `</table>`
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
inpWidth.addEventListener('input', () => { lastChangedSlider = 'width'; update() })
inpPitch.addEventListener('input', () => { lastChangedSlider = 'pitch'; update() })
for (const inp of [inpLength, inpEaves, inpGable]) {
  inp.addEventListener('input', update)
}
for (const chk of [chkLamberia, chkMembrane, chkRoofing]) {
  chk.addEventListener('change', update)
}

// ── Color picker ────────────────────────────────────────────────────────────
const RAL_COLORS = [
  { ral: '8004', name: 'Téglavörös',   hex: 0xCC6E52, shiny: true },
  { ral: '8017', name: 'Csokibarna',   hex: 0x8B6350, shiny: true },
  { ral: '7016', name: 'Antracit',     hex: 0x525A60, shiny: true },
  { ral: '3009', name: 'Bordó',        hex: 0x8B4538, shiny: true },
  { ral: '6020', name: 'Mohazöld',     hex: 0x4F5F40, shiny: false },
  { ral: '7005', name: 'Bazaltszürke', hex: 0x909585, shiny: false },
]

const ROUGHNESS_MATT = 0.5
const ROUGHNESS_SHINY = 0.35

let selectedRal = '8004'
let selectedFinish: 'matt' | 'shiny' = 'matt'

const colorSwatch = document.getElementById('color-swatch') as HTMLButtonElement
const colorPickerEl = document.getElementById('color-picker')!

// Build picker grid
const cpGrid = document.createElement('div')
cpGrid.className = 'color-picker-grid'

function hexStr(hex: number): string { return '#' + hex.toString(16).padStart(6, '0') }

for (const finish of ['matt', 'shiny'] as const) {
  const label = document.createElement('span')
  label.className = 'color-picker-label'
  label.textContent = finish === 'matt' ? 'Matt' : 'Fényes'
  cpGrid.appendChild(label)

  for (const c of RAL_COLORS) {
    const dot = document.createElement('button')
    dot.type = 'button'
    dot.className = 'color-dot'
    if (finish === 'shiny' && !c.shiny) {
      dot.classList.add('empty')
    } else {
      dot.style.backgroundColor = hexStr(c.hex)
      dot.title = `RAL ${c.ral} — ${c.name} (${finish === 'matt' ? 'matt' : 'fényes'})`
      dot.dataset.ral = c.ral
      dot.dataset.finish = finish
      dot.addEventListener('click', () => selectColor(c.ral, finish))
    }
    cpGrid.appendChild(dot)
  }
}
colorPickerEl.appendChild(cpGrid)

function selectColor(ral: string, finish: 'matt' | 'shiny'): void {
  selectedRal = ral
  selectedFinish = finish
  const color = RAL_COLORS.find(c => c.ral === ral)!
  const roughness = finish === 'matt' ? ROUGHNESS_MATT : ROUGHNESS_SHINY
  setMetalAppearance(color.hex, roughness)
  colorSwatch.style.backgroundColor = hexStr(color.hex)

  cpGrid.querySelectorAll('.color-dot').forEach(d => d.classList.remove('selected'))
  const sel = cpGrid.querySelector(`.color-dot[data-ral="${ral}"][data-finish="${finish}"]`)
  sel?.classList.add('selected')

  colorPickerEl.classList.remove('open')
  update()
}

colorSwatch.addEventListener('click', (e) => {
  e.stopPropagation()
  colorPickerEl.classList.toggle('open')
  timberPickerEl.classList.remove('open')
})

document.addEventListener('click', (e) => {
  const t = e.target as Node
  if (!colorPickerEl.contains(t) && e.target !== colorSwatch) {
    colorPickerEl.classList.remove('open')
  }
  if (!timberPickerEl.contains(t) && e.target !== timberSwatch) {
    timberPickerEl.classList.remove('open')
  }
})

// Mark initial selection
cpGrid.querySelector('.color-dot[data-ral="8004"][data-finish="matt"]')?.classList.add('selected')

// ── Timber color picker ─────────────────────────────────────────────────────
const TIMBER_COLORS = [
  { id: '6113', name: 'Natúr fenyő',      hex: 0xE4BC60 },
  { id: '609',  name: 'Tölgy',            hex: 0xD4A44A },
  { id: '610',  name: 'Erdei fenyő',      hex: 0xC89030 },
  { id: '611',  name: 'Dougles fenyő',    hex: 0xB88820 },
  { id: '612',  name: 'Teak',             hex: 0xB87030 },
  { id: '6123', name: 'Vörös cseresznye', hex: 0xB06828 },
  { id: '6179', name: 'Érett tölgy',      hex: 0xA87830 },
  { id: '616',  name: 'Szőke dió',        hex: 0x906020 },
  { id: '608',  name: 'Közép dió',        hex: 0x7A5020 },
  { id: '617',  name: 'Antik dió',        hex: 0x604018 },
  { id: '618',  name: 'Mahagóni',         hex: 0x6A2818 },
  { id: '6187', name: 'Vörös mahagóni',   hex: 0x581818 },
  { id: '619',  name: 'Wenge',            hex: 0x3A2818 },
  { id: '614',  name: 'Sötétzöld',        hex: 0x4A5C38 },
]

const DEFAULT_TIMBER = '610'
let selectedTimber = DEFAULT_TIMBER

const timberSwatch = document.getElementById('timber-swatch') as HTMLButtonElement
const timberPickerEl = document.getElementById('timber-picker')!

const tpGrid = document.createElement('div')
tpGrid.className = 'color-picker-grid'
tpGrid.style.gridTemplateColumns = 'repeat(7, 24px)'

for (const c of TIMBER_COLORS) {
  const dot = document.createElement('button')
  dot.type = 'button'
  dot.className = 'color-dot'
  dot.style.backgroundColor = hexStr(c.hex)
  dot.title = `XGT-${c.id} — ${c.name}`
  dot.dataset.timber = c.id
  dot.addEventListener('click', () => selectTimber(c.id))
  tpGrid.appendChild(dot)
}
timberPickerEl.appendChild(tpGrid)

function selectTimber(id: string): void {
  selectedTimber = id
  const color = TIMBER_COLORS.find(c => c.id === id)!
  setTimberColor(color.hex)
  timberSwatch.style.backgroundColor = hexStr(color.hex)

  tpGrid.querySelectorAll('.color-dot').forEach(d => d.classList.remove('selected'))
  tpGrid.querySelector(`.color-dot[data-timber="${id}"]`)?.classList.add('selected')

  timberPickerEl.classList.remove('open')
  update()
}

timberSwatch.addEventListener('click', (e) => {
  e.stopPropagation()
  timberPickerEl.classList.toggle('open')
  // Close metal picker if open
  colorPickerEl.classList.remove('open')
})

// Set initial timber color + selection
selectTimber(DEFAULT_TIMBER)

// ── Quote modal ─────────────────────────────────────────────────────────────
function openModal(): void {
  modalSummary.innerHTML =
    `<strong>${lastConfigSummary}</strong><br>` +
    `Becsült ár: <strong>~${formatHUF1k(lastTotal)}</strong>`
  hiddenConfig.value = lastConfigSummary
  hiddenPrice.value = formatHUF1k(lastTotal)
  hiddenUrl.value = window.location.href
  const submitBtn = quoteForm.querySelector('.btn-submit') as HTMLButtonElement
  submitBtn.disabled = false
  submitBtn.textContent = 'Árajánlat kérése'
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

// Restore colors from URL
const cParam = hashParams['c']
if (cParam) {
  const finish = cParam.endsWith('f') ? 'shiny' as const : 'matt' as const
  const ral = cParam.replace(/[mf]$/, '')
  if (RAL_COLORS.find(c => c.ral === ral && (finish === 'matt' || c.shiny))) {
    selectColor(ral, finish)
  }
}
const tParam = hashParams['t']
if (tParam && TIMBER_COLORS.find(c => c.id === tParam)) {
  selectTimber(tParam)
}

// Auto-open advanced section if any advanced param was customised in the URL
const advanced = document.getElementById('advanced') as HTMLDetailsElement
if ('p' in hashParams || 'e' in hashParams || 'g' in hashParams) {
  advanced.open = true
}

update()

// Scroll to anchor section if URL was e.g. /#craftsmanship
if (anchorTarget) {
  const el = document.getElementById(anchorTarget)
  if (el) requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth' }))
}

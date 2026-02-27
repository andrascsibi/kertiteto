/**
 * Fetches unit prices for materials and labour from a public Google Sheet.
 * Source: https://docs.google.com/spreadsheets/d/1nFUQiYx2QuqafM5mlEMXQUDAohdN4OG3NkmBc-sem9c
 *
 * Columns: anyag (ID), egyseg (unit), ar (price in HUF), tipus (category)
 */

const SHEET_ID = '1nFUQiYx2QuqafM5mlEMXQUDAohdN4OG3NkmBc-sem9c'
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv`

export type PriceUnit = 'db' | 'm' | 'm2' | 'm3' | 'l'
export type PriceCategory = 'anyag' | 'muhely' | 'helyszin' | ''

export interface PriceEntry {
  unit: PriceUnit
  /** Price per unit (HUF) */
  price: number
  category: PriceCategory
}

export type PriceTable = Record<string, PriceEntry>

/** Parse a CSV row, handling quoted fields */
function parseCSVRow(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; continue }
    if (ch === ',' && !inQuotes) { fields.push(current); current = ''; continue }
    current += ch
  }
  fields.push(current)
  return fields
}

export async function fetchPrices(): Promise<PriceTable> {
  const res = await fetch(CSV_URL)
  if (!res.ok) throw new Error(`Failed to fetch price sheet: ${res.status}`)
  const csv = await res.text()
  const lines = csv.trim().split('\n')

  // Skip header row (anyag, egyseg, ar)
  const table: PriceTable = {}
  for (const line of lines.slice(1)) {
    const [id, unit, priceStr, tipus] = parseCSVRow(line)
    if (!id) continue
    table[id] = { unit: unit as PriceUnit, price: Number(priceStr), category: (tipus || '') as PriceCategory }
  }
  return table
}

// ── Quote form submission: Web3Forms + FormSubmit (dual-send) ─────────────────
//
// Web3Forms: sends auto-confirmation email to the customer.
// FormSubmit: no confirmation email, but independent backup.
// Strategy: fire both in parallel. As long as at least one succeeds, we're good.

const WEB3FORMS_URL = 'https://api.web3forms.com/submit'
const WEB3FORMS_KEY = 'fd6ecc7f-eb18-4bfa-b49f-1ef5dbd4be0f'
const FORMSUBMIT_URL = 'https://formsubmit.co/ajax/hello@egyacs.com'

export interface QuoteFormData {
  name: string
  email: string
  phone: string
  city: string
  comment: string
  config: string             // configuration summary
  price: string              // estimated price
  url: string                // configurator URL with hash params
}

export interface SubmitResult {
  web3forms: boolean
  formsubmit: boolean
}

async function submitWeb3Forms(data: QuoteFormData): Promise<boolean> {
  try {
    const body: Record<string, string> = {
      access_key: WEB3FORMS_KEY,
      subject: 'Kerti tető árajánlat',
      from_name: 'Kertitető.hu',
      'Név': data.name,
      'E-mail': data.email,
      'Telefon': data.phone,
      'Település': data.city,
      'Megjegyzés': data.comment,
      'Konfiguráció': data.config,
      'Becsült ár': data.price,
      'URL': data.url,
    }
    const res = await fetch(WEB3FORMS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return res.ok
  } catch {
    return false
  }
}

async function submitFormSubmit(data: QuoteFormData): Promise<boolean> {
  try {
    const body: Record<string, string> = {
      _subject: 'Kerti tető árajánlat',
      _captcha: 'false',
      _template: 'table',
      'Név': data.name,
      'E-mail': data.email,
      'Telefon': data.phone,
      'Település': data.city,
      'Megjegyzés': data.comment,
      'Konfiguráció': data.config,
      'Becsült ár': data.price,
      'URL': data.url,
    }
    const res = await fetch(FORMSUBMIT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function submitQuote(data: QuoteFormData): Promise<SubmitResult> {
  const [web3forms, formsubmit] = await Promise.all([
    submitWeb3Forms(data),
    submitFormSubmit(data),
  ])

  if (!web3forms && !formsubmit) {
    throw new Error('Mindkét szolgáltatás elérhetetlen')
  }

  return { web3forms, formsubmit }
}

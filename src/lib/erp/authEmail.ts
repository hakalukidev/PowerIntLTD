// Firebase Auth needs an email per account. ERP users sign in with a phone number
// (or login ID), so each user gets a synthetic email derived from it.
export const AUTH_EMAIL_DOMAIN = 'erp.powerinternationalbd.local'

export function normalizePhoneKey(value: unknown) {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits ? digits.replace(/^(?:880|88|0)+/, '') : ''
}

function normalizeLoginKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '')
}

export function authEmailForUser(user: { phone?: string; loginId?: string }) {
  const phone = normalizePhoneKey(user.phone ?? '')
  const key = phone || normalizeLoginKey(user.loginId ?? '')
  return `${key}@${AUTH_EMAIL_DOMAIN}`
}

export function authEmailCandidates(identifier: string) {
  const value = identifier.trim().toLowerCase()
  if (!value) return []
  if (value.includes('@')) return [value]

  const candidates: string[] = []
  const phone = normalizePhoneKey(value)
  if (phone && /^[\d\s+()-]+$/.test(value)) {
    candidates.push(`${phone}@${AUTH_EMAIL_DOMAIN}`)
  }
  const loginKey = normalizeLoginKey(value)
  if (loginKey) candidates.push(`${loginKey}@${AUTH_EMAIL_DOMAIN}`)

  return Array.from(new Set(candidates))
}

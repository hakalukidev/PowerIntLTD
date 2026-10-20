export type NumberInputOptions = {
  /** Allow one decimal point (fields with step="any" or a fractional step). */
  decimal?: boolean
  /** Allow a leading minus sign (fields whose min is unset or below 0). */
  negative?: boolean
}

/**
 * Cleans what the user typed into a number field: drops anything that is not part of a number,
 * and strips leading zeros so typing into a field showing "0" gives "2000", not "02000".
 * "0." and "0.5" stay as they are so decimals can still be typed.
 */
export function sanitizeNumberInput(raw: string, { decimal = false, negative = false }: NumberInputOptions = {}): string {
  const trimmed = raw.trim()
  const sign = negative && trimmed.startsWith('-') ? '-' : ''

  let body = trimmed.replace(decimal ? /[^\d.]/g : /\D/g, '')
  if (decimal) {
    const dot = body.indexOf('.')
    if (dot !== -1) body = body.slice(0, dot + 1) + body.slice(dot + 1).replace(/\./g, '')
  }

  const dot = body.indexOf('.')
  let whole = dot === -1 ? body : body.slice(0, dot)
  const fraction = dot === -1 ? '' : body.slice(dot)
  whole = whole.replace(/^0+(?=\d)/, '')
  if (whole === '' && fraction) whole = '0'

  return sign + whole + fraction
}

/** Whether a step attribute allows decimals ("any", or a step like 0.01). */
export function stepAllowsDecimal(step: string | number | undefined): boolean {
  if (step === undefined || step === '') return false
  if (step === 'any') return true
  const value = Number(step)
  return Number.isFinite(value) && !Number.isInteger(value)
}

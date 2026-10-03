import type { PortalDeliveryStatus } from '@/lib/erp/types'
import { internationalPhone } from '@/lib/erp/utils'

/**
 * Sends dealer and supplier messages through the WhatsApp Business Cloud API (Meta).
 *
 * Environment:
 * - WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID: required; without them nothing is sent
 *   and messages only reach the portal inbox.
 * - WHATSAPP_TEMPLATE_NAME (+ WHATSAPP_TEMPLATE_LANGUAGE, default `en`): an approved template
 *   with one body variable ({{1}}). WhatsApp only delivers free text to people who wrote to the
 *   business in the last 24 hours, so alerts the office starts need a template.
 * - WHATSAPP_IMAGE_TEMPLATE_NAME: optional approved template with an image header and one body
 *   variable, used for statement images. Without it, template mode sends the image's link.
 * - WHATSAPP_API_VERSION: Graph API version, default `v21.0`.
 */

export type WhatsAppResult = { status: PortalDeliveryStatus; error?: string }

type WhatsAppConfig = {
  token: string
  phoneNumberId: string
  version: string
  template: string
  imageTemplate: string
  language: string
}

function readConfig(): WhatsAppConfig | null {
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim()
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim()
  if (!token || !phoneNumberId) return null
  return {
    token,
    phoneNumberId,
    version: process.env.WHATSAPP_API_VERSION?.trim() || 'v21.0',
    template: process.env.WHATSAPP_TEMPLATE_NAME?.trim() ?? '',
    imageTemplate: process.env.WHATSAPP_IMAGE_TEMPLATE_NAME?.trim() ?? '',
    language: process.env.WHATSAPP_TEMPLATE_LANGUAGE?.trim() || 'en',
  }
}

export function whatsappConfigured() {
  return readConfig() !== null
}

/** Template variables may not hold line breaks, tabs, or more than four spaces in a row. */
function templateText(text: string) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' | ')
    .replace(/\s{4,}/g, '   ')
    .slice(0, 1000)
}

function messagePayload(config: WhatsAppConfig, to: string, text: string, imageUrl?: string) {
  const base = { messaging_product: 'whatsapp', recipient_type: 'individual', to }

  if (config.template) {
    if (imageUrl && config.imageTemplate) {
      return {
        ...base,
        type: 'template',
        template: {
          name: config.imageTemplate,
          language: { code: config.language },
          components: [
            { type: 'header', parameters: [{ type: 'image', image: { link: imageUrl } }] },
            { type: 'body', parameters: [{ type: 'text', text: templateText(text) }] },
          ],
        },
      }
    }
    return {
      ...base,
      type: 'template',
      template: {
        name: config.template,
        language: { code: config.language },
        components: [{ type: 'body', parameters: [{ type: 'text', text: templateText(imageUrl ? `${text}\n${imageUrl}` : text) }] }],
      },
    }
  }

  if (imageUrl) {
    return { ...base, type: 'image', image: { link: imageUrl, caption: text.slice(0, 1024) } }
  }
  return { ...base, type: 'text', text: { preview_url: false, body: text.slice(0, 4096) } }
}

/** Sends one message. Never throws: the outcome is reported so it can be shown next to the message. */
export async function sendWhatsApp(phone: string, text: string, imageUrl?: string): Promise<WhatsAppResult> {
  const config = readConfig()
  if (!config) return { status: 'not_configured' }

  const to = internationalPhone(phone)
  if (!to) return { status: 'no_phone' }

  try {
    const response = await fetch(`https://graph.facebook.com/${config.version}/${config.phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(messagePayload(config, to, text, imageUrl)),
    })
    if (response.ok) return { status: 'sent' }

    const result = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
    const error = result?.error?.message ?? `WhatsApp returned ${response.status}.`
    console.error('WhatsApp send failed:', error)
    return { status: 'failed', error: error.slice(0, 300) }
  } catch (reason) {
    console.error('WhatsApp send failed:', reason)
    return { status: 'failed', error: 'WhatsApp could not be reached.' }
  }
}

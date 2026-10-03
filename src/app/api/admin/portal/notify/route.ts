import { NextResponse } from 'next/server'

import type { PortalNoticeInput, PortalPartyKind } from '@/lib/erp/types'
import { formatDate } from '@/lib/erp/utils'
import {
  companyInfo,
  deliverPortalMessage,
  isPartyKind,
  loadMessages,
  loadParty,
  loadPartyLedger,
} from '@/lib/firebase/portal'
import { balanceText } from '@/lib/firebase/portalMessages'
import { AuthorizationError, callerPermissions, requireSignedIn } from '@/lib/firebase/requireAdmin'

export const runtime = 'nodejs'

const VIEW_PERMISSION: Record<PortalPartyKind, string> = { customer: 'credit_sheet.view', supplier: 'suppliers.view' }
const SEND_PERMISSION: Record<PortalPartyKind, string> = { customer: 'credit_sheet.edit', supplier: 'suppliers.edit' }
const NOTICE_KINDS = ['payment_reminder', 'statement', 'notice'] as const

function fail(reason: unknown) {
  if (reason instanceof AuthorizationError) {
    return NextResponse.json({ error: reason.message }, { status: reason.status })
  }
  const message = reason instanceof Error ? reason.message : 'Something went wrong.'
  return NextResponse.json({ error: message }, { status: 400 })
}

async function requireAccess(request: Request, kind: PortalPartyKind, permissionByKind: Record<PortalPartyKind, string>) {
  const signedIn = await requireSignedIn(request)
  if (!(await callerPermissions(signedIn.db, signedIn.caller)).includes(permissionByKind[kind])) {
    throw new AuthorizationError('You do not have permission to do that.', 403)
  }
  return signedIn
}

/** Statement images are uploaded to the company's Cloudinary; nothing else is sent to a dealer. */
function readImageUrl(value: unknown) {
  if (value === undefined || value === '') return undefined
  if (typeof value !== 'string') throw new Error('Invalid statement image.')
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com') {
    throw new Error('The statement image must be uploaded first.')
  }
  return url.toString()
}

/** The messages a dealer or supplier was sent, for the office to see. */
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams
    const partyKind = params.get('partyKind')
    const partyId = params.get('partyId')?.trim() ?? ''
    if (!isPartyKind(partyKind) || !partyId) throw new Error('Choose a dealer or supplier.')
    const { db } = await requireAccess(request, partyKind, VIEW_PERMISSION)
    return NextResponse.json({ messages: await loadMessages(db, partyKind, partyId) })
  } catch (reason) {
    return fail(reason)
  }
}

/** The office sends a payment reminder, a statement image, or a notice to a dealer or supplier. */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Partial<PortalNoticeInput>
    if (!isPartyKind(body.partyKind)) throw new Error('Choose a dealer or supplier.')
    if (!NOTICE_KINDS.includes(body.kind as (typeof NOTICE_KINDS)[number])) throw new Error('Choose what to send.')
    const partyKind = body.partyKind
    const kind = body.kind as (typeof NOTICE_KINDS)[number]
    const { db, caller } = await requireAccess(request, partyKind, SEND_PERMISSION)

    const partyId = (body.partyId ?? '').trim()
    const party = partyId ? await loadParty(db, partyKind, partyId) : null
    if (!party) throw new Error(partyKind === 'customer' ? 'Dealer not found.' : 'Supplier not found.')

    const note = (body.message ?? '').trim().slice(0, 1000)
    const imageUrl = readImageUrl(body.imageUrl)
    if (kind === 'notice' && !note) throw new Error('Write the message to send.')
    if (kind === 'statement' && !imageUrl) throw new Error('The statement image is missing.')

    const company = await companyInfo(db)
    const { totals } = await loadPartyLedger(db, partyKind, partyId)
    const balance = balanceText(totals.balance, company.currency)
    const today = formatDate(new Date().toISOString())

    const content = {
      payment_reminder: {
        title: `Payment reminder - ${company.name}`,
        body: [
          `Dear ${party.name}, your balance with ${company.name} is ${balance} as of ${today}.`,
          note || 'Please arrange the payment at your earliest convenience.',
        ].join('\n'),
      },
      statement: {
        title: `Account statement - ${company.name}`,
        body: [`Dear ${party.name}, your account statement as of ${today} is attached.`, `Balance: ${balance}`, note].filter(Boolean).join('\n'),
      },
      notice: { title: company.name, body: note },
    }[kind]

    const message = await deliverPortalMessage(db, {
      partyKind,
      partyId,
      phone: party.phone,
      kind,
      ...content,
      imageUrl,
      createdByName: caller.name,
    })

    return NextResponse.json({ message })
  } catch (reason) {
    return fail(reason)
  }
}

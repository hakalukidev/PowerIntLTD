import { createHash } from 'crypto'

import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { publicId } = (await request.json()) as { publicId?: string }

    if (!publicId) {
      return NextResponse.json({ error: 'Image public ID is required.' }, { status: 400 })
    }

    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
    const apiKey = process.env.CLOUDINARY_API_KEY
    const apiSecret = process.env.CLOUDINARY_API_SECRET

    if (!cloudName || !apiKey || !apiSecret) {
      return NextResponse.json({ error: 'Cloudinary delete configuration is missing.' }, { status: 500 })
    }

    const timestamp = Math.round(Date.now() / 1000)
    const signature = createHash('sha1')
      .update(`public_id=${publicId}&timestamp=${timestamp}${apiSecret}`)
      .digest('hex')

    const formData = new FormData()
    formData.append('public_id', publicId)
    formData.append('timestamp', String(timestamp))
    formData.append('api_key', apiKey)
    formData.append('signature', signature)

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      const details = await response.text()
      return NextResponse.json({ error: 'Unable to delete image.', details }, { status: 502 })
    }

    const result = await response.json()
    return NextResponse.json({ result })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unexpected image deletion error.' },
      { status: 500 }
    )
  }
}

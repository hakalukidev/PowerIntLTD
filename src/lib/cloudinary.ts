export type CloudinaryUploadResult = {
  imageUrl: string
  imagePublicId: string
}

export async function uploadImageToCloudinary(file: File, folder: string): Promise<CloudinaryUploadResult> {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
  const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET

  if (!cloudName || !uploadPreset) {
    throw new Error('Cloudinary upload configuration is missing.')
  }

  const formData = new FormData()
  formData.append('file', file)
  formData.append('upload_preset', uploadPreset)
  formData.append('folder', folder)

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    throw new Error('Unable to upload image.')
  }

  const result = (await response.json()) as { secure_url?: string; public_id?: string }
  if (!result.secure_url || !result.public_id) {
    throw new Error('Cloudinary did not return a valid image response.')
  }

  return {
    imageUrl: result.secure_url,
    imagePublicId: result.public_id,
  }
}

/** What a delivery or expense document may be: a phone photo or a PDF. */
export const DOCUMENT_ACCEPT = 'image/jpeg,image/png,image/heic,image/heif,.jpg,.jpeg,.png,.heic,.heif,application/pdf,.pdf'
export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024

const DOCUMENT_TYPES = /^(image\/(jpeg|png|heic|heif)|application\/pdf)$/
const DOCUMENT_EXTENSIONS = /\.(jpe?g|png|heic|heif|pdf)$/i
/** Photos above this are shrunk before upload; phone photos are often 3–8 MB. */
const COMPRESS_ABOVE_BYTES = 1.5 * 1024 * 1024
const COMPRESS_MAX_SIDE = 2000
const COMPRESS_QUALITY = 0.8

export const UPLOADS_UNAVAILABLE_MESSAGE =
  'Document uploads are unavailable right now: the file storage (Cloudinary) account is not active. Nothing was submitted. Please tell the admin.'

export type UploadStage = 'compressing' | 'uploading'
export type UploadProgress = { stage: UploadStage; percent: number }

/** Returns why the file cannot be used as a document, or null when it can. */
export function documentFileProblem(file: File) {
  // Some browsers leave the type of a HEIC file empty, so the extension decides then.
  if (!DOCUMENT_TYPES.test(file.type) && !DOCUMENT_EXTENSIONS.test(file.name)) {
    return 'Use a JPG, PNG or HEIC photo, or a PDF.'
  }
  return null
}

/**
 * Shrinks a large photo to a JPEG of at most 2000px a side. PDFs, small files and photos the
 * browser cannot read (HEIC outside Safari) are returned unchanged.
 */
export async function compressDocumentImage(file: File): Promise<File> {
  if (file.size <= COMPRESS_ABOVE_BYTES || file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return file
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return file
  }
  const scale = Math.min(1, COMPRESS_MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    return file
  }
  // A PNG with transparency would turn black as a JPEG.
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', COMPRESS_QUALITY))
  if (!blob || blob.size >= file.size) return file
  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg', lastModified: file.lastModified })
}

/** Turns Cloudinary's answer into a message the person uploading can act on. */
function uploadErrorMessage(status: number, body: string) {
  let message = ''
  try {
    message = (JSON.parse(body) as { error?: { message?: string } }).error?.message ?? ''
  } catch {
    // Not JSON; the status decides.
  }
  if (status === 401 || status === 403 || /disabled|invalid api key|unknown api key/i.test(message)) return UPLOADS_UNAVAILABLE_MESSAGE
  if (/upload preset/i.test(message)) return UPLOADS_UNAVAILABLE_MESSAGE
  if (/file size too large/i.test(message) || status === 413) return 'The file is too large to upload. Use a smaller photo or PDF.'
  if (/invalid image file|unsupported/i.test(message)) return 'This file could not be read. Use a JPG, PNG or HEIC photo, or a PDF.'
  return message ? `Upload failed: ${message}` : `Upload failed (error ${status}). Please try again.`
}

/**
 * Uploads a document (photo or PDF) after shrinking large photos, reporting progress as it goes.
 * Errors carry a plain message, including when the Cloudinary account cannot take uploads.
 */
export async function uploadDocumentToCloudinary(
  file: File,
  folder: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<CloudinaryUploadResult> {
  const problem = documentFileProblem(file)
  if (problem) throw new Error(problem)

  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
  const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET
  if (!cloudName || !uploadPreset) throw new Error(UPLOADS_UNAVAILABLE_MESSAGE)

  onProgress?.({ stage: 'compressing', percent: 0 })
  const upload = await compressDocumentImage(file)
  if (upload.size > DOCUMENT_MAX_BYTES) {
    throw new Error(`The file is ${(upload.size / 1024 / 1024).toFixed(1)} MB; the limit is ${DOCUMENT_MAX_BYTES / 1024 / 1024} MB.`)
  }

  const formData = new FormData()
  formData.append('file', upload)
  formData.append('upload_preset', uploadPreset)
  formData.append('folder', folder)

  onProgress?.({ stage: 'uploading', percent: 0 })
  // XMLHttpRequest rather than fetch: only it reports upload progress.
  const { status, body } = await new Promise<{ status: number; body: string }>((resolve, reject) => {
    const request = new XMLHttpRequest()
    // "auto" stores PDFs as well as photos.
    request.open('POST', `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`)
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.({ stage: 'uploading', percent: Math.round((event.loaded / event.total) * 100) })
    }
    request.onload = () => resolve({ status: request.status, body: request.responseText })
    request.onerror = () => reject(new Error('Upload failed: no connection to the file storage. Check the internet and try again.'))
    request.ontimeout = () => reject(new Error('Upload timed out. Check the internet and try again.'))
    request.send(formData)
  })

  if (status < 200 || status >= 300) throw new Error(uploadErrorMessage(status, body))
  const result = JSON.parse(body) as { secure_url?: string; public_id?: string }
  if (!result.secure_url || !result.public_id) throw new Error('Upload failed: the file storage did not return the file. Please try again.')
  onProgress?.({ stage: 'uploading', percent: 100 })
  return { imageUrl: result.secure_url, imagePublicId: result.public_id }
}

export async function deleteCloudinaryImage(publicId: string) {
  const response = await fetch('/api/cloudinary/delete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ publicId }),
  })

  if (!response.ok) {
    throw new Error('Unable to delete image.')
  }
}

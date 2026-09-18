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

/**
 * Storage service — handles file uploads to Firebase Storage.
 *
 * TEST_MODE: uploads are stubbed. The file is converted to a base64 data URL
 * via FileReader so the preview works immediately without any cloud calls.
 * The data URL is stored in AppConfig just like a real download URL would be.
 *
 * Production: uploads to Firebase Storage using the VITE_FIREBASE_STORAGE_BUCKET
 * configured in firebase.ts. Returns the public download URL.
 */

const IS_TEST = import.meta.env.VITE_TEST_MODE === 'true'

export const LOGO_MAX_BYTES = 2 * 1024 * 1024  // 2 MB
export const LOGO_ACCEPT    = ['image/png', 'image/jpeg'] as const

/**
 * Returns a validation error message, or null if the file is acceptable.
 * Exported separately so LogoUpload can validate on file selection without
 * starting an upload.
 */
export function validateLogoFile(file: File): string | null {
  if (!LOGO_ACCEPT.includes(file.type as typeof LOGO_ACCEPT[number])) {
    return 'Only PNG and JPG files are supported.'
  }
  if (file.size > LOGO_MAX_BYTES) {
    return 'File must be 2 MB or smaller.'
  }
  return null
}

/**
 * Uploads a logo file and returns its public URL.
 * Throws if the file fails validation or the upload fails.
 */
export async function uploadLogo(file: File): Promise<string> {
  const err = validateLogoFile(file)
  if (err) throw new Error(err)

  if (IS_TEST) {
    console.log('[storage-service] Logo upload (TEST_MODE):', {
      name: file.name,
      size: `${(file.size / 1024).toFixed(1)} KB`,
      type: file.type,
    })
    // Convert to data URL — works as an <img src> immediately and persists in
    // localStorage alongside the rest of AppConfig.
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload  = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsDataURL(file)
    })
  }

  // Production: upload to Firebase Storage, return download URL.
  const { app } = await import('@/config/firebase')
  if (!app) throw new Error('Firebase app not initialized')
  const { getStorage, ref, uploadBytes, getDownloadURL } = await import('firebase/storage')
  const storage = getStorage(app)
  const storageRef = ref(storage, `logos/${Date.now()}_${file.name}`)
  const snapshot = await uploadBytes(storageRef, file)
  return getDownloadURL(snapshot.ref)
}

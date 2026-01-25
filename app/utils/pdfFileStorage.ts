import { randomUUID } from "expo-crypto"
import * as FileSystem from "expo-file-system/legacy"

import { load, remove, save } from "./storage"

export interface StoredPdfFile {
  uri: string // file:// path in documentDirectory
  name: string // original filename
  timestamp: number
}

const STORAGE_PREFIX = "pdfFiles:"

/**
 * Stores a PDF file in documentDirectory with a stable UUID and returns the fileId.
 * @param sourceUri The source file URI (typically from DocumentPicker cache).
 * @param originalName The original filename.
 * @returns The fileId (UUID) that can be used to retrieve the file later.
 */
export async function storePdfFile(sourceUri: string, originalName: string): Promise<string> {
  const fileId = randomUUID()
  const fileName = `${fileId}.pdf`
  const destUri = `${FileSystem.documentDirectory}${fileName}`

  // Copy file to documentDirectory
  await FileSystem.copyAsync({ from: sourceUri, to: destUri })

  // Store metadata in MMKV
  const metadata: StoredPdfFile = {
    uri: destUri,
    name: originalName,
    timestamp: Date.now(),
  }
  save(`${STORAGE_PREFIX}${fileId}`, metadata)

  return fileId
}

/**
 * Retrieves stored PDF file metadata by fileId.
 * @param fileId The UUID file identifier.
 * @returns The stored file metadata or null if not found.
 */
export function getPdfFile(fileId: string): StoredPdfFile | null {
  return load<StoredPdfFile>(`${STORAGE_PREFIX}${fileId}`)
}

/**
 * Deletes a stored PDF file and its metadata.
 * @param fileId The UUID file identifier.
 */
export async function deletePdfFile(fileId: string): Promise<void> {
  const file = getPdfFile(fileId)
  if (file?.uri) {
    try {
      await FileSystem.deleteAsync(file.uri, { idempotent: true })
    } catch {
      // Ignore deletion errors
    }
  }
  remove(`${STORAGE_PREFIX}${fileId}`)
}

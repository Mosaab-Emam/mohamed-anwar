/**
 * Portable PDF library storage.
 * Single folder (manifest.enc + {fileId}.pdf) in documentDirectory/PDFLibrary/.
 * Manifest is encrypted; PDF files are stored plain. Export/import use the same format.
 */

import { randomUUID } from "expo-crypto"
import { fromByteArray, toByteArray } from "base64-js"
import * as FileSystem from "expo-file-system/legacy"

import { decryptBytes, encryptBytes } from "./pdfLibraryCrypto"
import type { PdfInfoBubble, PdfLink } from "./pdfLinkStorage"

const LIBRARY_DIR = "PDFLibrary"
const MANIFEST_FILENAME = "manifest.enc"
const PDF_SUFFIX = ".pdf"
const ENC_SUFFIX = ".pdf.enc"

export interface LibraryEntryMeta {
  fileId: string
  name: string
  timestamp: number
}

export interface LibraryEntry extends LibraryEntryMeta {
  links: PdfLink[]
  infoBubbles: PdfInfoBubble[]
}

interface LibraryManifest {
  version: number
  entries: LibraryEntry[]
}

function getLibraryRoot(): string {
  const root = FileSystem.documentDirectory
  if (!root) throw new Error("documentDirectory is null")
  return `${root}${LIBRARY_DIR}/`
}

async function ensureLibraryDir(): Promise<string> {
  const root = getLibraryRoot()
  const info = await FileSystem.getInfoAsync(root)
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(root, { intermediates: true })
  }
  return root
}

/**
 * Returns the path to the PDF file for fileId (.pdf if present, else .pdf.enc), or null if neither exists.
 */
async function getLibraryPdfPath(
  root: string,
  fileId: string,
): Promise<{ path: string; encrypted: boolean } | null> {
  const pdfPath = `${root}${fileId}${PDF_SUFFIX}`
  const pdfInfo = await FileSystem.getInfoAsync(pdfPath)
  if (pdfInfo.exists) return { path: pdfPath, encrypted: false }
  const encPath = `${root}${fileId}${ENC_SUFFIX}`
  const encInfo = await FileSystem.getInfoAsync(encPath)
  if (encInfo.exists) return { path: encPath, encrypted: true }
  return null
}

async function readManifest(root: string): Promise<LibraryManifest> {
  const path = `${root}${MANIFEST_FILENAME}`
  const info = await FileSystem.getInfoAsync(path)
  if (!info.exists) {
    return { version: 1, entries: [] }
  }
  const base64 = await FileSystem.readAsStringAsync(path, {
    encoding: FileSystem.EncodingType.Base64,
  })
  const combined = toByteArray(base64)
  const decrypted = await decryptBytes(combined)
  const json = new TextDecoder().decode(decrypted)
  return JSON.parse(json) as LibraryManifest
}

async function writeManifest(root: string, manifest: LibraryManifest): Promise<void> {
  const base64 = await manifestToEncryptedBase64(manifest)
  const path = `${root}${MANIFEST_FILENAME}`
  await FileSystem.writeAsStringAsync(path, base64, {
    encoding: FileSystem.EncodingType.Base64,
  })
}

async function manifestToEncryptedBase64(manifest: LibraryManifest): Promise<string> {
  const json = JSON.stringify(manifest)
  const plaintext = new TextEncoder().encode(json)
  const combined = await encryptBytes(plaintext)
  return fromByteArray(combined)
}

/**
 * List all library entries (from the encrypted manifest).
 */
export async function listLibraryEntries(): Promise<LibraryEntryMeta[]> {
  const root = await ensureLibraryDir()
  const manifest = await readManifest(root)
  return manifest.entries.map((e) => ({
    fileId: e.fileId,
    name: e.name,
    timestamp: e.timestamp,
  }))
}

/**
 * Get a single library entry by fileId, or null if not found.
 */
export async function getLibraryEntry(fileId: string): Promise<LibraryEntry | null> {
  const root = await ensureLibraryDir()
  const manifest = await readManifest(root)
  return manifest.entries.find((e) => e.fileId === fileId) ?? null
}

/**
 * Add a PDF to the library (store plain). Returns the new fileId.
 */
export async function addToLibrary(sourcePdfUri: string, name: string): Promise<string> {
  const root = await ensureLibraryDir()
  const fileId = randomUUID()
  const pdfPath = `${root}${fileId}${PDF_SUFFIX}`
  await FileSystem.copyAsync({ from: sourcePdfUri, to: pdfPath })
  const manifest = await readManifest(root)
  manifest.entries.push({
    fileId,
    name,
    timestamp: Date.now(),
    links: [],
    infoBubbles: [],
  })
  await writeManifest(root, manifest)
  return fileId
}

/**
 * Update links and info bubbles for a library entry.
 */
export async function updateLibraryEntryLinks(
  fileId: string,
  links: PdfLink[],
  infoBubbles: PdfInfoBubble[],
): Promise<boolean> {
  const root = await ensureLibraryDir()
  const manifest = await readManifest(root)
  const entry = manifest.entries.find((e) => e.fileId === fileId)
  if (!entry) return false
  entry.links = links
  entry.infoBubbles = infoBubbles
  await writeManifest(root, manifest)
  return true
}

/**
 * Get PDF content as base64 for viewing. Prefers plain .pdf; migrates .pdf.enc on read.
 */
export async function getLibraryPdfBase64(fileId: string): Promise<string | null> {
  const root = getLibraryRoot()
  const resolved = await getLibraryPdfPath(root, fileId)
  if (!resolved) return null
  const base64 = await FileSystem.readAsStringAsync(resolved.path, {
    encoding: FileSystem.EncodingType.Base64,
  })
  if (!resolved.encrypted) return base64
  const combined = toByteArray(base64)
  const decrypted = await decryptBytes(combined)
  const plainBase64 = fromByteArray(decrypted)
  const pdfPath = `${root}${fileId}${PDF_SUFFIX}`
  await FileSystem.writeAsStringAsync(pdfPath, plainBase64, {
    encoding: FileSystem.EncodingType.Base64,
  })
  await FileSystem.deleteAsync(resolved.path, { idempotent: true })
  return plainBase64
}

/**
 * Remove a PDF and its metadata from the library.
 */
export async function removeFromLibrary(fileId: string): Promise<void> {
  const root = await ensureLibraryDir()
  try {
    await FileSystem.deleteAsync(`${root}${fileId}${PDF_SUFFIX}`, { idempotent: true })
  } catch {
    // ignore
  }
  try {
    await FileSystem.deleteAsync(`${root}${fileId}${ENC_SUFFIX}`, { idempotent: true })
  } catch {
    // ignore
  }
  const manifest = await readManifest(root)
  manifest.entries = manifest.entries.filter((e) => e.fileId !== fileId)
  await writeManifest(root, manifest)
}

/**
 * Export the library to a user-chosen directory (SAF on Android).
 * destinationDirectoryUri: from StorageAccessFramework.requestDirectoryPermissionsAsync().directoryUri.
 * Creates manifest.enc and {fileId}.pdf (plain) in that directory.
 */
export async function exportLibraryToDirectory(destinationDirectoryUri: string): Promise<void> {
  const root = await ensureLibraryDir()
  const manifest = await readManifest(root)
  const { StorageAccessFramework } = FileSystem

  const writeFileToDir = async (
    dirUri: string,
    fileName: string,
    base64Content: string,
  ): Promise<void> => {
    const fileUri = await StorageAccessFramework.createFileAsync(
      dirUri,
      fileName.replace(/\.[^.]+$/, ""),
      "application/octet-stream",
    )
    await FileSystem.writeAsStringAsync(fileUri, base64Content, {
      encoding: FileSystem.EncodingType.Base64,
    })
  }

  const manifestPath = `${root}${MANIFEST_FILENAME}`
  const manifestBase64 = await FileSystem.readAsStringAsync(manifestPath, {
    encoding: FileSystem.EncodingType.Base64,
  })
  await writeFileToDir(destinationDirectoryUri, MANIFEST_FILENAME, manifestBase64)

  for (const entry of manifest.entries) {
    const pdfBase64 = await getLibraryPdfBase64(entry.fileId)
    if (pdfBase64 == null) continue
    await writeFileToDir(destinationDirectoryUri, `${entry.fileId}${PDF_SUFFIX}`, pdfBase64)
  }
}

/**
 * Export a single library entry to a user-chosen directory (SAF on Android).
 * Creates a folder with the same format: manifest.enc (one entry) + {fileId}.pdf (plain).
 * Use this to send one PDF (and its links) to a consumer without exporting the whole library.
 */
export async function exportLibraryEntryToDirectory(
  fileId: string,
  destinationDirectoryUri: string,
): Promise<void> {
  await ensureLibraryDir()
  const entry = await getLibraryEntry(fileId)
  if (!entry) throw new Error("Library entry not found")
  const pdfBase64 = await getLibraryPdfBase64(fileId)
  if (pdfBase64 == null) throw new Error("PDF file not found")

  const { StorageAccessFramework } = FileSystem
  const singleManifest: LibraryManifest = { version: 1, entries: [entry] }
  const manifestBase64 = await manifestToEncryptedBase64(singleManifest)
  const writeFileToDir = async (
    dirUri: string,
    fileName: string,
    base64Content: string,
  ): Promise<void> => {
    const fileUri = await StorageAccessFramework.createFileAsync(
      dirUri,
      fileName.replace(/\.[^.]+$/, ""),
      "application/octet-stream",
    )
    await FileSystem.writeAsStringAsync(fileUri, base64Content, {
      encoding: FileSystem.EncodingType.Base64,
    })
  }
  await writeFileToDir(destinationDirectoryUri, MANIFEST_FILENAME, manifestBase64)
  await writeFileToDir(destinationDirectoryUri, `${fileId}${PDF_SUFFIX}`, pdfBase64)
}

function isLibraryManifest(obj: unknown): obj is LibraryManifest {
  return (
    typeof obj === "object" &&
    obj != null &&
    "version" in obj &&
    "entries" in obj &&
    Array.isArray((obj as LibraryManifest).entries)
  )
}

/**
 * Import a library from a user-chosen directory (SAF on Android).
 * Merges entries by fileId (existing entries are replaced).
 * Finds manifest by trying to decrypt each file until one yields valid manifest JSON.
 */
export async function importLibraryFromDirectory(sourceDirectoryUri: string): Promise<void> {
  const { StorageAccessFramework } = FileSystem
  const root = await ensureLibraryDir()
  const fileUris = await StorageAccessFramework.readDirectoryAsync(sourceDirectoryUri)
  let importedManifest: LibraryManifest | null = null
  for (const uri of fileUris) {
    if (uri.endsWith("/") || !uri.includes("manifest")) continue
    try {
      const manifestBase64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      })
      const combined = toByteArray(manifestBase64)
      const decrypted = await decryptBytes(combined)
      const parsed = JSON.parse(new TextDecoder().decode(decrypted)) as unknown
      if (isLibraryManifest(parsed)) {
        importedManifest = parsed
        break
      }
    } catch {
      // not the manifest file, try next
    }
  }
  if (!importedManifest) {
    throw new Error("No valid manifest found in the selected folder")
  }

  for (const entry of importedManifest.entries) {
    const plainUri = fileUris.find(
      (u) =>
        !u.endsWith("/") &&
        u.includes(entry.fileId) &&
        (u.endsWith(".pdf") || u.includes(`${entry.fileId}.pdf`)) &&
        !u.includes(".enc"),
    )
    const encUri =
      plainUri ??
      fileUris.find(
        (u) =>
          !u.endsWith("/") &&
          u.includes(entry.fileId) &&
          (u.includes("pdf") || u.includes(".enc")) &&
          !u.includes("manifest"),
      )
    const sourceUri = plainUri ?? encUri
    if (!sourceUri) continue
    const isEncrypted = !plainUri
    try {
      let base64 = await FileSystem.readAsStringAsync(sourceUri, {
        encoding: FileSystem.EncodingType.Base64,
      })
      if (isEncrypted) {
        const combined = toByteArray(base64)
        const decrypted = await decryptBytes(combined)
        base64 = fromByteArray(decrypted)
      }
      const destPath = `${root}${entry.fileId}${PDF_SUFFIX}`
      await FileSystem.writeAsStringAsync(destPath, base64, {
        encoding: FileSystem.EncodingType.Base64,
      })
    } catch {
      // skip this file if read/write fails
    }
  }

  const currentManifest = await readManifest(root)
  const byId = new Map(currentManifest.entries.map((e) => [e.fileId, e]))
  for (const entry of importedManifest.entries) {
    byId.set(entry.fileId, entry)
  }
  currentManifest.entries = Array.from(byId.values())
  await writeManifest(root, currentManifest)
}

import { randomUUID } from "expo-crypto"

import { load, remove, save } from "./storage"

export interface PdfLinkDestination {
  title: string
  page: number // 1-based
}

export interface PdfLinkRect {
  x: number
  y: number
  width: number
  height: number
}

export interface PdfLink {
  id: string
  page: number
  rect: PdfLinkRect
  destinations: PdfLinkDestination[]
}

export interface PdfInfoBubblePosition {
  x: number
  y: number
}

export interface PdfInfoBubble {
  id: string
  page: number
  position: PdfInfoBubblePosition
  text: string
}

const STORAGE_PREFIX = "pdfLinks:"
const INFO_STORAGE_PREFIX = "pdfInfoBubbles:"

/**
 * Loads link metadata for a stored PDF.
 */
export function getPdfLinks(fileId: string): PdfLink[] | null {
  return load<PdfLink[]>(`${STORAGE_PREFIX}${fileId}`)
}

/**
 * Saves link metadata for a stored PDF (replaces existing).
 */
export function savePdfLinks(fileId: string, links: PdfLink[]): boolean {
  return save(`${STORAGE_PREFIX}${fileId}`, links)
}

/**
 * Appends a link and saves. Returns the updated list or null on failure.
 */
export function addPdfLink(fileId: string, link: Omit<PdfLink, "id">): PdfLink[] | null {
  const existing = getPdfLinks(fileId) ?? []
  const newLink: PdfLink = {
    ...link,
    id: randomUUID(),
  }
  const next = [...existing, newLink]
  const ok = savePdfLinks(fileId, next)
  return ok ? next : null
}

/**
 * Removes link metadata for a file (e.g. when file is deleted).
 */
export function removePdfLinks(fileId: string): void {
  remove(`${STORAGE_PREFIX}${fileId}`)
}

/**
 * Loads info bubble metadata for a stored PDF.
 */
export function getPdfInfoBubbles(fileId: string): PdfInfoBubble[] | null {
  return load<PdfInfoBubble[]>(`${INFO_STORAGE_PREFIX}${fileId}`)
}

/**
 * Saves info bubble metadata for a stored PDF (replaces existing).
 */
export function savePdfInfoBubbles(fileId: string, bubbles: PdfInfoBubble[]): boolean {
  return save(`${INFO_STORAGE_PREFIX}${fileId}`, bubbles)
}

/**
 * Appends an info bubble and saves. Returns the updated list or null on failure.
 */
export function addPdfInfoBubble(
  fileId: string,
  bubble: Omit<PdfInfoBubble, "id">,
): PdfInfoBubble[] | null {
  const existing = getPdfInfoBubbles(fileId) ?? []
  const newBubble: PdfInfoBubble = {
    ...bubble,
    id: randomUUID(),
  }
  const next = [...existing, newBubble]
  const ok = savePdfInfoBubbles(fileId, next)
  return ok ? next : null
}

/**
 * Removes info bubble metadata for a file (e.g. when file is deleted).
 */
export function removePdfInfoBubbles(fileId: string): void {
  remove(`${INFO_STORAGE_PREFIX}${fileId}`)
}

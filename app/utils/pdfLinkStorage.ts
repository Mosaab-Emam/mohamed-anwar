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

const STORAGE_PREFIX = "pdfLinks:"

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

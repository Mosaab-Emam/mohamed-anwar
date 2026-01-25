/**
 * Parses a deep link URL and extracts fileId and page parameters.
 * Expected format: mohamed-anwar://Demo/PdfViewer?fileId={uuid}&page={pageNumber}
 *
 * @param url The deep link URL to parse
 * @returns Object with fileId and page, or null if invalid
 */
export interface ParsedDeepLink {
  fileId: string
  page: number
}

export function parseDeepLinkUrl(url: string): ParsedDeepLink | null {
  try {
    // Parse the URL
    const parsed = new URL(url)

    // Validate scheme
    if (parsed.protocol !== "mohamed-anwar:") {
      return null
    }

    // Validate path - URL constructor treats "Demo" as hostname, so pathname is "/PdfViewer"
    // We need to check: hostname === "Demo" AND pathname === "/PdfViewer"
    if (!(parsed.hostname === "Demo" && parsed.pathname === "/PdfViewer")) {
      return null
    }

    // Extract fileId
    const fileId = parsed.searchParams.get("fileId")
    if (!fileId) {
      return null
    }

    // Extract page (defaults to 1 if not provided or invalid)
    const pageParam = parsed.searchParams.get("page")
    const page = pageParam ? parseInt(pageParam, 10) : 1

    // Validate page is a positive number
    if (isNaN(page) || page < 1) {
      return null
    }

    return {
      fileId: decodeURIComponent(fileId),
      page,
    }
  } catch (error) {
    // Invalid URL format
    return null
  }
}

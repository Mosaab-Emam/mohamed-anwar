# AGENTS.md

This file helps AI coding agents become productive quickly in fresh sessions.

## Project at a glance

- Type: React Native mobile app (Expo + Ignite boilerplate).
- Main product features today:
  - View local PDF files.
  - Add custom tappable links on top of PDF pages.
  - Generate QR codes that deep-link into a specific stored PDF and page.
  - Scan QR codes (camera or gallery image) and open the target PDF/page.
- Language/UI direction:
  - Arabic is forced as primary locale.
  - RTL layout is forced globally.

## Tech stack

- React Native `0.81`, React `19`, Expo SDK `54`.
- Navigation: React Navigation (native stack + bottom tabs).
- PDF rendering/editor UI: `react-native-webview` + inlined `pdf.js` HTML.
- Storage:
  - Metadata: MMKV (`react-native-mmkv`).
  - PDF files: copied into `FileSystem.documentDirectory`.
- QR:
  - Generation: `react-native-qrcode-svg`.
  - Scanning camera: `expo-camera`.
  - Scanning gallery images: `react-native-qr-kit` + `expo-image-picker`.

## Important directories and ownership

- `app/app.tsx`: app bootstrap, providers, and deep-link config.
- `app/navigators/`:
  - `AppNavigator.tsx`: top-level stack.
  - `DemoNavigator.tsx`: bottom tabs (PDF + QR scanner).
  - `PdfStackNavigator.tsx`: nested PDF stack.
  - `navigationTypes.ts`: source of truth for route params.
- `app/screens/`:
  - `PdfViewerScreen.tsx`: pick/open PDF, render, QR generation, link destination chooser.
  - `PdfLinkEditorScreen.tsx`: draw link rectangles and save destinations.
  - `QrScannerScreen.tsx`: scan QR and navigate to PDF.
- `app/utils/`:
  - `pdfFileStorage.ts`: stable file storage by `fileId`.
  - `pdfLinkStorage.ts`: persisted link metadata by `fileId`.
  - `parseDeepLinkUrl.ts`: URL contract validation for QR payloads.
  - `pdfViewerHtml.ts` and `pdfEditorHtml.ts`: embedded pdf.js logic + RN bridge messaging.
- `app/i18n/`: translations (`ar.ts`, `en.ts`) and forced locale setup (`index.ts`).
- `.cursor/rules/pdf-qr-code.mdc`: project rule covering PDF/QR architecture patterns.

## Runtime architecture and flows

### 1) PDF open and persist flow

1. User picks PDF from `expo-document-picker`.
2. App copies picked file to `FileSystem.documentDirectory` using `storePdfFile()`.
3. File metadata is stored in MMKV under key prefix `pdfFiles:`.
4. `fileId` becomes the stable identifier used by deep links and QR codes.

### 2) PDF rendering flow

1. Native screen reads local PDF as base64 (`expo-file-system/legacy`).
2. `getPdfViewerHtml()` or `getPdfEditorHtml()` builds html string.
3. WebView renders PDF via CDN-hosted `pdf.js`.
4. HTML sends events to native with `window.ReactNativeWebView.postMessage(...)`.

### 3) Link editor flow

1. Editor mode draws normalized rectangles (`x/y/width/height`, 0-1 scale).
2. A link stores one or more destinations `{ title, page }`.
3. Links are saved under MMKV key prefix `pdfLinks:`.
4. Viewer overlays link regions and asks user to choose destination when tapped.

### 4) QR deep-link flow

1. Viewer creates URL with current `fileId` + `currentPage`.
2. QR encodes this URL.
3. Scanner decodes QR (camera or image), validates payload, checks file existence.
4. App navigates to `PdfViewer` with `{ fileId, page }`.

## Data contracts you must preserve

- Deep link format:
  - `mohamed-anwar://Demo/PdfViewer?fileId={encodedId}&page={pageNumber}`
- URI scheme:
  - Must stay `mohamed-anwar` (defined in `app.json` and parser logic).
- Navigation param contracts (from `navigationTypes.ts`):
  - `PdfViewer: { uri?: string; fileId?: string; page?: number } | undefined`
  - `PdfLinkEditor: { fileId?: string } | undefined`
- Storage key prefixes:
  - Files: `pdfFiles:`
  - Links: `pdfLinks:`

If you change any of these contracts, update:
- parser (`parseDeepLinkUrl.ts`)
- QR generator logic
- navigation types and route usage
- any tests or i18n messaging impacted

## Agent working conventions for this repo

- Prefer modifying existing feature files over adding new abstractions.
- Keep route param types synchronized with actual `navigate(...)` usage.
- Keep WebView message types explicit and backward-compatible (`type` field).
- Preserve normalized rectangle semantics for PDF overlays.
- When adding user-facing text, add both Arabic and English keys.
- Respect ESLint import ordering and project component wrappers (avoid raw RN `Text`, `Button`, `TextInput`).

## Known constraints and gotchas

- This app is mobile-first; web paths for PDF/QR are intentionally limited.
- Viewer/editor rely on `pdf.js` CDN URLs; offline behavior is currently not addressed.
- Current product flow assumes locally stored PDFs for QR deep links.
- There is still Ignite boilerplate in the repo (Demo/Auth screens), but primary entry route is `Demo`.

## Debug instrumentation

When adding runtime logging (e.g. for Cursor debug mode or bug investigation):

- **Use HTTP only.** Send log payloads via `fetch` POST to the debug server endpoint provided in the session. Do not write log files from the app: `expo-file-system/legacy` does not expose `appendAsStringAsync`; using it will throw at runtime.
- **Use the correct host for the debug server.** From the app, `127.0.0.1` is the device/emulator itself, not the host machine. Use:
  - **Android emulator:** host `10.0.2.2` (emulator’s alias for the host).
  - **iOS simulator:** host `127.0.0.1` (simulator shares the host’s loopback).
  - Example: `const host = Platform.OS === "android" ? "10.0.2.2" : "127.0.0.1"`.
- **Keep instrumentation minimal and removable.** Wrap debug-only code in collapsible regions (e.g. `// #region agent log` / `// #endregion`) and remove all instrumentation once the issue is confirmed fixed.

## High-value commands for CI/local verification

- Install deps: `pnpm install`
- Typecheck: `pnpm run compile`
- Lint check only: `pnpm run lint:check`
- Tests: `pnpm test`

Run these before finalizing non-trivial changes when feasible.

## Suggested change playbook for agents

When touching PDF/QR features:

1. Update screen logic (`PdfViewerScreen`, `PdfLinkEditorScreen`, `QrScannerScreen`).
2. Verify utility contracts (`pdfFileStorage`, `pdfLinkStorage`, `parseDeepLinkUrl`).
3. Ensure navigation params remain type-safe.
4. Update both `ar.ts` and `en.ts` for any new strings.
5. Run typecheck/lint/tests if possible.

When adding a new major function:

1. Decide if it belongs in the existing PDF tab stack or as a new tab/stack.
2. Add types first in `navigationTypes.ts`.
3. Wire navigator(s), then screen, then i18n labels.
4. Document new contracts in this `AGENTS.md`.

## Current product direction

The project is evolving from a template into a focused PDF utility app:
- PDF viewing is core.
- Link authoring and QR round-tripping are core.
- Additional document-related utilities are expected to be added incrementally.

Prioritize consistency with existing PDF/QR architecture over broad refactors.

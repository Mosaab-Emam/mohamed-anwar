import { FC, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ActivityIndicator, Platform, TextStyle, View, ViewStyle } from "react-native"
import * as DocumentPicker from "expo-document-picker"
import * as FileSystem from "expo-file-system/legacy"
import { WebView } from "react-native-webview"

import { Button } from "@/components/Button"
import { EmptyState } from "@/components/EmptyState"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { translate } from "@/i18n/translate"
import { PdfStackScreenProps } from "@/navigators/navigationTypes"
import { useAppTheme } from "@/theme/context"
import { $styles } from "@/theme/styles"
import type { ThemedStyle } from "@/theme/types"
import { getPdfEditorHtml } from "@/utils/pdfEditorHtml"
import { getPdfFile, storePdfFile } from "@/utils/pdfFileStorage"
import {
  addPdfInfoBubble,
  addPdfLink,
  getPdfInfoBubbles,
  getPdfLinks,
  type PdfInfoBubble,
  type PdfLink,
} from "@/utils/pdfLinkStorage"
import { useHeader } from "@/utils/useHeader"

type PickedFile = { uri: string; name: string }

export const PdfLinkEditorScreen: FC<PdfStackScreenProps<"PdfLinkEditor">> = (props) => {
  const { route, navigation } = props
  const { themed } = useAppTheme()
  const [picked, setPicked] = useState<PickedFile | null>(null)
  const [base64, setBase64] = useState<string | null>(null)
  const [base64Error, setBase64Error] = useState<string | null>(null)
  const [fileId, setFileId] = useState<string | null>(null)
  const [isStoring, setIsStoring] = useState(false)
  const [editorLinks, setEditorLinks] = useState<PdfLink[]>([])
  const [editorInfoBubbles, setEditorInfoBubbles] = useState<PdfInfoBubble[]>([])
  const [editorPage, setEditorPage] = useState(1)
  /** Page to open when the editor HTML is (re)loaded. Only updated when we force a reload (e.g. after saving a link), not on every Next/Prev. */
  const pageForLoadRef = useRef(1)

  useHeader(
    {
      titleTx: "pdfLinkEditorScreen:title",
      leftTx: "common:back",
      onLeftPress: () => navigation.goBack(),
    },
    [navigation],
  )

  const fileIdFromParams = route.params?.fileId
  const uri = picked?.uri ?? null
  const isLocal = useMemo(() => uri != null && uri.startsWith("file://"), [uri])

  useEffect(() => {
    if (!fileIdFromParams) return
    const stored = getPdfFile(fileIdFromParams)
    if (stored) {
      const links = getPdfLinks(fileIdFromParams) ?? []
      const infoBubbles = getPdfInfoBubbles(fileIdFromParams) ?? []
      setPicked({ uri: stored.uri, name: stored.name })
      setFileId(fileIdFromParams)
      setEditorLinks(links)
      setEditorInfoBubbles(infoBubbles)
      setBase64(null)
      setBase64Error(null)
      pageForLoadRef.current = 1
    } else {
      setBase64Error(translate("pdfViewerScreen:fileNotFound"))
      setPicked(null)
      setFileId(null)
      setEditorLinks([])
      setEditorInfoBubbles([])
    }
  }, [fileIdFromParams])

  useEffect(() => {
    if (!fileId || !uri || !isLocal) return
    let cancelled = false
    setBase64Error(null)
    FileSystem.readAsStringAsync(uri, { encoding: "base64" })
      .then((b) => {
        if (!cancelled) setBase64(b)
      })
      .catch((e) => {
        if (!cancelled) setBase64Error(e?.message ?? "Failed to read file")
      })
    return () => {
      cancelled = true
    }
  }, [isLocal, uri, fileId])

  useEffect(() => {
    if (fileIdFromParams || fileId || !uri || !isLocal) return
    const storeFile = async () => {
      setIsStoring(true)
      try {
        const storedFileId = await storePdfFile(uri, picked?.name ?? "document.pdf")
        setFileId(storedFileId)
        setEditorLinks(getPdfLinks(storedFileId) ?? [])
        setEditorInfoBubbles(getPdfInfoBubbles(storedFileId) ?? [])
      } catch (e) {
        console.warn("Failed to store file for editor:", e)
      } finally {
        setIsStoring(false)
      }
    }
    storeFile()
  }, [uri, isLocal, picked?.name, fileIdFromParams, fileId])

  const pickDocument = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        copyToCacheDirectory: true,
      })
      if (result.canceled) return
      const asset = result.assets[0]
      if (asset?.uri != null) {
        setPicked({ uri: asset.uri, name: asset.name ?? "document.pdf" })
        setFileId(null)
        setEditorLinks([])
        setEditorInfoBubbles([])
        setEditorPage(1)
        pageForLoadRef.current = 1
        setBase64(null)
        setBase64Error(null)
      }
    } catch (e) {
      setBase64Error(e instanceof Error ? e.message : "Failed to pick document")
    }
  }, [])

  const handleWebViewMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      try {
        const message = JSON.parse(event.nativeEvent.data)
        if (message.type === "editorPageChanged" && typeof message.page === "number") {
          setEditorPage(message.page)
        }
        if (message.type === "linkSaved" && fileId) {
          const { page, rect, destinations } = message
          if (
            typeof page === "number" &&
            rect &&
            typeof rect.x === "number" &&
            typeof rect.y === "number" &&
            typeof rect.width === "number" &&
            typeof rect.height === "number" &&
            Array.isArray(destinations) &&
            destinations.length > 0
          ) {
            pageForLoadRef.current = editorPage
            addPdfLink(fileId, { page, rect, destinations })
            setEditorLinks(getPdfLinks(fileId) ?? [])
          }
        }
        if (message.type === "infoBubbleSaved" && fileId) {
          const { page, position, text } = message
          if (
            typeof page === "number" &&
            position &&
            typeof position.x === "number" &&
            typeof position.y === "number" &&
            typeof text === "string" &&
            text.trim().length > 0
          ) {
            pageForLoadRef.current = editorPage
            addPdfInfoBubble(fileId, {
              page,
              position: {
                x: Math.max(0, Math.min(1, position.x)),
                y: Math.max(0, Math.min(1, position.y)),
              },
              text: text.trim(),
            })
            setEditorInfoBubbles(getPdfInfoBubbles(fileId) ?? [])
          }
        }
        // Handle bulk links saved - don't update state until user dismisses the result modal
        if (message.type === "bulkLinksSaved" && fileId && Array.isArray(message.links)) {
          for (const link of message.links) {
            const { page, rect, destinations } = link
            if (
              typeof page === "number" &&
              rect &&
              typeof rect.x === "number" &&
              typeof rect.y === "number" &&
              typeof rect.width === "number" &&
              typeof rect.height === "number" &&
              Array.isArray(destinations) &&
              destinations.length > 0
            ) {
              addPdfLink(fileId, { page, rect, destinations })
            }
          }
          // Don't call setEditorLinks here - let the WebView show the result first
          // The links will be visible when the page is refreshed or user navigates away
        }
        // Handle bulk result dismissed - now safe to update the editor links
        if (message.type === "bulkResultDismissed" && fileId) {
          pageForLoadRef.current = editorPage
          setEditorLinks(getPdfLinks(fileId) ?? [])
          setEditorInfoBubbles(getPdfInfoBubbles(fileId) ?? [])
        }
      } catch {
        // Ignore parse errors
      }
    },
    [fileId, editorPage],
  )

  const html = useMemo(() => {
    if (!base64 && !uri) return null
    if (isLocal && !base64 && !base64Error) return null
    if (isLocal && base64Error) return null
    return getPdfEditorHtml({
      base64: isLocal && base64 ? base64 : undefined,
      page: pageForLoadRef.current,
      links: editorLinks,
      infoBubbles: editorInfoBubbles,
    })
  }, [uri, base64, base64Error, isLocal, editorLinks, editorInfoBubbles])

  const isLoadingBase64 =
    (fileIdFromParams != null && !picked) ||
    (isLocal && uri != null && base64 == null && base64Error == null)
  const showEditor = html != null && fileId != null && !isLoadingBase64 && !base64Error
  const showEmpty = uri == null && !fileIdFromParams && !isLoadingBase64 && !isStoring

  if (Platform.OS === "web") {
    return (
      <Screen preset="fixed" contentContainerStyle={$styles.flex1} safeAreaEdges={["top"]}>
        <Text tx="pdfViewerScreen:webUnsupported" preset="subheading" style={themed($centerText)} />
      </Screen>
    )
  }

  return (
    <Screen preset="fixed" contentContainerStyle={$styles.flex1} safeAreaEdges={["top"]}>
      {showEmpty && (
        <View style={[themed($centered), themed($emptyContainer)]}>
          <EmptyState
            preset="generic"
            style={themed($emptyState)}
            headingTx="pdfLinkEditorScreen:noFileSelected"
            content=""
            buttonTx="pdfLinkEditorScreen:selectPdf"
            buttonOnPress={pickDocument}
          />
        </View>
      )}

      {isLoadingBase64 && (
        <View style={[themed($centered), themed($emptyContainer)]}>
          <ActivityIndicator size="large" />
          <Text tx="common:loadingPdf" style={themed($loadingText)} />
        </View>
      )}

      {isStoring && showEditor && (
        <Text tx="pdfViewerScreen:storingFile" style={themed($storingText)} />
      )}

      {base64Error != null && !showEditor && (
        <View style={[themed($centered), themed($emptyContainer)]}>
          <Text text={base64Error} style={themed($errorText)} />
          <Button
            tx="pdfLinkEditorScreen:selectPdf"
            onPress={pickDocument}
            style={themed($selectButton)}
          />
        </View>
      )}

      {showEditor && html != null && (
        <View style={$styles.flex1}>
          <WebView
            key={`editor-${fileId}-${base64?.length ?? 0}`}
            source={{ html }}
            style={$styles.flex1}
            scrollEnabled
            onMessage={handleWebViewMessage}
            originWhitelist={["*"]}
            mixedContentMode="compatibility"
            javaScriptEnabled
          />
        </View>
      )}
    </Screen>
  )
}

const $emptyState: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginBottom: spacing.lg,
})

const $centerText: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  textAlign: "center",
  padding: 24,
})

const $centered: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
  paddingHorizontal: spacing.lg,
})

const $emptyContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingVertical: spacing.xl,
})

const $loadingText: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginTop: spacing.md,
})

const $selectButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginTop: spacing.md,
})

const $storingText: ThemedStyle<TextStyle> = () => ({
  fontSize: 12,
})

const $errorText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.error,
  marginBottom: 16,
  textAlign: "center",
})

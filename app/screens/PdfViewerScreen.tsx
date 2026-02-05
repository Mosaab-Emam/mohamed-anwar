import { FC, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useFocusEffect } from "@react-navigation/native"
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  StyleSheet,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native"
import * as DocumentPicker from "expo-document-picker"
import * as MediaLibrary from "expo-media-library"
import * as FileSystem from "expo-file-system/legacy"
import QRCode from "react-native-qrcode-svg"
import { WebView } from "react-native-webview"

import { Button } from "@/components/Button"
import { EmptyState } from "@/components/EmptyState"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { translate } from "@/i18n/translate"
import { DemoTabScreenProps } from "@/navigators/navigationTypes"
import { useAppTheme } from "@/theme/context"
import { $styles } from "@/theme/styles"
import type { ThemedStyle } from "@/theme/types"
import { getPdfFile, storePdfFile } from "@/utils/pdfFileStorage"
import type { PdfLink, PdfLinkDestination } from "@/utils/pdfLinkStorage"
import { getPdfLinks } from "@/utils/pdfLinkStorage"
import { getPdfViewerHtml } from "@/utils/pdfViewerHtml"
import { useHeader } from "@/utils/useHeader"

type PickedFile = { uri: string; name: string }

export const PdfViewerScreen: FC<DemoTabScreenProps<"PdfViewer">> = (props) => {
  const { route, navigation } = props
  const { themed } = useAppTheme()
  const [picked, setPicked] = useState<PickedFile | null>(null)
  const [base64, setBase64] = useState<string | null>(null)
  const [base64Error, setBase64Error] = useState<string | null>(null)
  const [webViewReady, setWebViewReady] = useState(false)
  const [currentPage, setCurrentPage] = useState(() => {
    const pageFromParams = route.params?.page
    return pageFromParams && pageFromParams > 0 ? pageFromParams : 1
  })
  const [fileId, setFileId] = useState<string | null>(null)
  const [isStoring, setIsStoring] = useState(false)
  const [showQrModal, setShowQrModal] = useState(false)
  const [qrError, setQrError] = useState<string | null>(null)
  const [qrSaved, setQrSaved] = useState(false)
  const qrSvgRef = useRef<{ toDataURL: (cb: (data: string) => void) => void } | null>(null)
  const webViewRef = useRef<WebView>(null)
  const [linksRefreshKey, setLinksRefreshKey] = useState(0)
  const [destinationModalVisible, setDestinationModalVisible] = useState(false)
  const [destinationChoices, setDestinationChoices] = useState<PdfLinkDestination[] | null>(null)
  const pdfLinks = useMemo(
    () => (fileId ? getPdfLinks(fileId) ?? [] : []),
    [fileId, linksRefreshKey],
  )

  useFocusEffect(
    useCallback(() => {
      setLinksRefreshKey((k) => k + 1)
    }, [fileId]),
  )

  useHeader(
    {
      titleTx: "pdfViewerScreen:title",
    },
    [],
  )

  const uriFromParams = route.params?.uri
  const fileIdFromParams = route.params?.fileId
  const pageFromParams = route.params?.page ?? 1
  const uri = uriFromParams ?? picked?.uri ?? null
  const page = uriFromParams != null || fileIdFromParams != null ? pageFromParams : currentPage

  const isLocal = useMemo(() => uri != null && uri.startsWith("file://"), [uri])

  // Handle deep link with fileId
  useEffect(() => {
    if (fileIdFromParams) {
      const storedFile = getPdfFile(fileIdFromParams)
      if (storedFile) {
        setPicked({ uri: storedFile.uri, name: storedFile.name })
        setFileId(fileIdFromParams)
        setBase64(null)
        setBase64Error(null)
        // Set page from params if provided
        if (pageFromParams && pageFromParams > 0) {
          setCurrentPage(pageFromParams)
        }
      } else {
        setBase64Error(translate("pdfViewerScreen:fileNotFound"))
      }
    }
  }, [fileIdFromParams, pageFromParams])

  // Store file when picked (for QR code generation)
  useEffect(() => {
    if (fileIdFromParams || fileId || !uri || !isLocal) return

    const storeFile = async () => {
      setIsStoring(true)
      try {
        const storedFileId = await storePdfFile(uri, picked?.name ?? "document.pdf")
        setFileId(storedFileId)
      } catch (e) {
        // Silently fail - QR generation will handle this
        console.warn("Failed to store file for QR:", e)
      } finally {
        setIsStoring(false)
      }
    }

    storeFile()
  }, [uri, isLocal, picked?.name, fileIdFromParams, fileId])

  useEffect(() => {
    if (!isLocal || !uri) return
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
  }, [isLocal, uri])

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
        setBase64(null)
        setBase64Error(null)
      }
    } catch (e) {
      setBase64Error(e instanceof Error ? e.message : "Failed to pick document")
    }
  }, [])

  const clearAndPickAnother = useCallback(() => {
    setPicked(null)
    setBase64(null)
    setBase64Error(null)
    setWebViewReady(false)
    setFileId(null)
    setCurrentPage(1)
    navigation.setParams({ uri: undefined, fileId: undefined, page: undefined } as object)
  }, [navigation])

  const handleWebViewMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    try {
      const message = JSON.parse(event.nativeEvent.data)
      if (message.type === "pageChanged" && typeof message.page === "number") {
        setCurrentPage(message.page)
      }
      if (message.type === "linkClicked" && Array.isArray(message.destinations) && message.destinations.length > 0) {
        setDestinationChoices(message.destinations as PdfLinkDestination[])
        setDestinationModalVisible(true)
      }
    } catch {
      // Ignore parse errors
    }
  }, [])

  const closeDestinationModal = useCallback(() => {
    setDestinationModalVisible(false)
    setDestinationChoices(null)
  }, [])

  const selectDestination = useCallback((d: PdfLinkDestination) => {
    setCurrentPage(d.page)
    webViewRef.current?.injectJavaScript(`window.goToPage(${d.page}); true;`)
    closeDestinationModal()
  }, [closeDestinationModal])

  const generateDeepLinkUrl = useCallback(() => {
    if (!fileId || !currentPage) return null
    const scheme = "mohamed-anwar"
    return `${scheme}://Demo/PdfViewer?fileId=${encodeURIComponent(fileId)}&page=${currentPage}`
  }, [fileId, currentPage])

  const handleGenerateQr = useCallback(() => {
    if (!fileId || !currentPage) {
      setQrError(translate("pdfViewerScreen:qrError"))
      return
    }
    setQrError(null)
    setQrSaved(false)
    setShowQrModal(true)
  }, [fileId, currentPage])

  const handleSaveQrToGallery = useCallback(async () => {
    const svg = qrSvgRef.current
    if (!svg) {
      setQrError(translate("pdfViewerScreen:qrError"))
      return
    }

    try {
      const { status } = await MediaLibrary.requestPermissionsAsync()
      if (status !== "granted") {
        setQrError(translate("pdfViewerScreen:grantPermissions"))
        return
      }

      const dataUrl = await new Promise<string>((resolve, reject) => {
        svg.toDataURL((data: string) => {
          if (data) resolve(data)
          else reject(new Error("toDataURL returned empty"))
        })
      })

      const base64 = dataUrl.startsWith("data:image/png;base64,")
        ? dataUrl.replace(/^data:image\/png;base64,/, "")
        : dataUrl

      const fileUri = `${FileSystem.cacheDirectory}qr-${Date.now()}.png`
      await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: "base64" })

      await MediaLibrary.createAssetAsync(fileUri)
      setQrSaved(true)
      setTimeout(() => {
        setShowQrModal(false)
        setQrSaved(false)
      }, 1500)
    } catch {
      setQrError(translate("pdfViewerScreen:qrError"))
    }
  }, [])

  const html = useMemo(() => {
    if (!uri && !base64) return null
    if (isLocal && !base64 && !base64Error) return null
    if (isLocal && base64Error) return null
    return getPdfViewerHtml({
      base64: isLocal && base64 ? base64 : undefined,
      page,
      links: pdfLinks.length > 0 ? pdfLinks : undefined,
    })
  }, [uri, base64, base64Error, isLocal, page, pdfLinks])

  const isLoadingBase64 = isLocal && uri != null && base64 == null && base64Error == null
  const showViewer = html != null && !isLoadingBase64
  const showEmpty = uri == null && !isLoadingBase64 && !isStoring

  if (Platform.OS === "web") {
    return (
      <Screen preset="fixed" contentContainerStyle={$styles.flex1} safeAreaEdges={["top"]}>
        <View style={[styles.centered, themed($emptyContainer)]}>
          <Text tx="pdfViewerScreen:webUnsupported" preset="subheading" />
        </View>
      </Screen>
    )
  }

  return (
    <Screen preset="fixed" contentContainerStyle={$styles.flex1} safeAreaEdges={["top"]}>
      {showEmpty && (
        <View style={[styles.centered, themed($emptyContainer)]}>
          <EmptyState
            preset="generic"
            style={themed($emptyState)}
            headingTx="pdfViewerScreen:noFileSelected"
            content=""
            buttonTx="pdfViewerScreen:selectPdf"
            buttonOnPress={pickDocument}
          />
        </View>
      )}

      {isLoadingBase64 && (
        <View style={[styles.centered, themed($emptyContainer)]}>
          <ActivityIndicator size="large" />
          <Text text="Loading PDF…" style={themed($loadingText)} />
        </View>
      )}

      {isStoring && showViewer && (
        <View style={themed($storingIndicator)}>
          <ActivityIndicator size="small" />
          <Text tx="pdfViewerScreen:storingFile" style={themed($storingText)} />
        </View>
      )}

      {base64Error != null && !showViewer && (
        <View style={[styles.centered, themed($emptyContainer)]}>
          <Text text={base64Error} style={themed($errorText)} />
          <Button
            tx="pdfViewerScreen:selectPdf"
            onPress={pickDocument}
            style={themed($selectButton)}
          />
        </View>
      )}

      {showViewer && html != null && (
        <View style={$styles.flex1}>
          <WebView
            key={`pdf-${fileId ?? ""}-${page}-${pdfLinks.length}-${linksRefreshKey}`}
            ref={webViewRef}
            source={{ html }}
            style={themed($webview)}
            scrollEnabled
            onLoadEnd={() => setWebViewReady(true)}
            onMessage={handleWebViewMessage}
            originWhitelist={["*"]}
            mixedContentMode="compatibility"
          />
          {webViewReady && (
            <View style={themed($toolbar)}>
              <Button
                tx="pdfViewerScreen:addLinks"
                onPress={() =>
                  navigation.navigate("PdfLinkEditor", { fileId: fileId ?? undefined })
                }
                disabled={!fileId || isStoring}
                style={themed($generateQrButton)}
              />
              <Button
                tx="pdfViewerScreen:generateQr"
                onPress={handleGenerateQr}
                disabled={!fileId || isStoring}
                style={themed($generateQrButton)}
              />
              <Button
                tx="pdfViewerScreen:selectAnother"
                onPress={clearAndPickAnother}
                style={themed($selectAnotherButton)}
              />
            </View>
          )}
        </View>
      )}

      <Modal
        visible={destinationModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeDestinationModal}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.modalOverlay, themed($modalOverlay)]}
          onPress={closeDestinationModal}
        >
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
            <View style={themed($destinationModalContent)}>
              <Text preset="heading" tx="pdfViewerScreen:chooseDestination" style={themed($destinationModalTitle)} />
              <FlatList
                data={destinationChoices ?? []}
                keyExtractor={(item, index) => `${item.page}-${item.title}-${index}`}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={themed($destinationItem)}
                    onPress={() => selectDestination(item)}
                    activeOpacity={0.7}
                  >
                    <Text
                      text={translate("pdfViewerScreen:destinationOption", { title: item.title, page: item.page })}
                      preset="default"
                      style={themed($destinationItemText)}
                    />
                  </TouchableOpacity>
                )}
                style={themed($destinationList)}
              />
              <Button tx="common:cancel" onPress={closeDestinationModal} style={themed($cancelQrButton)} />
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={showQrModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowQrModal(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.modalOverlay, themed($modalOverlay)]}
          onPress={() => setShowQrModal(false)}
        >
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
            <View style={themed($qrModalContent)}>
              <Text preset="heading" tx="pdfViewerScreen:qrCode" style={themed($qrModalTitle)} />
              {qrError && <Text text={qrError} style={themed($qrErrorText)} />}
              {qrSaved && <Text tx="pdfViewerScreen:qrSaved" style={themed($qrSuccessText)} />}
              {generateDeepLinkUrl() && !qrSaved && (
                <View style={themed($qrCodeContainer)}>
                  <QRCode
                    value={generateDeepLinkUrl() ?? ""}
                    size={250}
                    quietZone={20}
                    getRef={(c) => {
                      qrSvgRef.current = c
                    }}
                  />
                </View>
              )}
              {!qrSaved && (
                <View style={themed($qrModalButtons)}>
                  <Button
                    tx="pdfViewerScreen:saveToGallery"
                    onPress={handleSaveQrToGallery}
                    style={themed($saveQrButton)}
                  />
                  <Button
                    tx="common:cancel"
                    onPress={() => setShowQrModal(false)}
                    style={themed($cancelQrButton)}
                  />
                </View>
              )}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </Screen>
  )
}

const styles = StyleSheet.create({
  centered: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  modalOverlay: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
})

const $webview: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.transparent,
  flex: 1,
})

const $emptyContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingVertical: spacing.xl,
})

const $emptyState: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginBottom: spacing.lg,
})

const $selectButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginTop: spacing.md,
})

const $selectAnotherButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginHorizontal: spacing.lg,
  marginBottom: spacing.md,
})

const $toolbar: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingTop: spacing.sm,
  paddingBottom: spacing.lg,
})

const $loadingText: ThemedStyle<TextStyle> = ({ spacing }) => ({
  marginTop: spacing.md,
})

const $errorText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.error,
  marginBottom: 16,
  textAlign: "center",
})

const $generateQrButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginHorizontal: spacing.lg,
  marginBottom: spacing.md,
})

const $qrModalContent: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  alignItems: "center",
  backgroundColor: colors.background,
  borderRadius: 16,
  padding: spacing.xl,
  width: "100%",
  maxWidth: 400,
})

const $qrModalTitle: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginBottom: spacing.lg,
})

const $destinationModalContent: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  alignItems: "stretch",
  backgroundColor: colors.background,
  borderRadius: 16,
  padding: spacing.xl,
  width: "100%",
  maxWidth: 400,
  maxHeight: "90%",
})

const $destinationModalTitle: ThemedStyle<TextStyle> = ({ spacing }) => ({
  marginBottom: spacing.md,
})

const $destinationList: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 440,
  maxHeight: 520,
  marginBottom: spacing.md,
})

const $destinationItem: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  paddingVertical: spacing.md,
  paddingHorizontal: spacing.sm,
  borderBottomWidth: StyleSheet.hairlineWidth,
  borderBottomColor: colors.palette.neutral400,
})

const $destinationItemText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
})

const $qrCodeContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  backgroundColor: "#FFFFFF",
  borderRadius: 8,
  justifyContent: "center",
  marginBottom: spacing.lg,
  padding: spacing.lg,
})

const $qrModalButtons: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.md,
  width: "100%",
})

const $saveQrButton: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $cancelQrButton: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $qrErrorText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.error,
  marginBottom: spacing.md,
  textAlign: "center",
})

const $modalOverlay: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.palette.overlay50,
})

const $qrSuccessText: ThemedStyle<TextStyle> = ({ colors, spacing: _spacing }) => ({
  color: colors.text,
  marginBottom: _spacing.md,
  textAlign: "center",
})

const $storingIndicator: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  flexDirection: "row",
  gap: spacing.sm,
  justifyContent: "center",
  padding: spacing.sm,
})

const $storingText: ThemedStyle<TextStyle> = () => ({
  fontSize: 12,
})

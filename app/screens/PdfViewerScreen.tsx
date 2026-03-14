import { useFocusEffect } from "@react-navigation/native"
import * as DocumentPicker from "expo-document-picker"
import * as FileSystem from "expo-file-system/legacy"
import * as MediaLibrary from "expo-media-library"
import { FC, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ActivityIndicator,
  FlatList,
  I18nManager,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TextStyle,
  TouchableOpacity,
  useWindowDimensions,
  View,
  ViewStyle,
} from "react-native"
import QRCode from "react-native-qrcode-svg"
import { WebView } from "react-native-webview"

import { Button } from "@/components/Button"
import { EmptyState } from "@/components/EmptyState"
import { Icon } from "@/components/Icon"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { usePdfTabs } from "@/context/PdfTabsContext"
import { translate } from "@/i18n/translate"
import { PdfStackScreenProps } from "@/navigators/navigationTypes"
import { useAppTheme } from "@/theme/context"
import { $styles } from "@/theme/styles"
import type { ThemedStyle } from "@/theme/types"
import { getPdfFile, storePdfFile } from "@/utils/pdfFileStorage"
import type { PdfInfoBubble, PdfLinkDestination } from "@/utils/pdfLinkStorage"
import { getPdfInfoBubbles, getPdfLinks } from "@/utils/pdfLinkStorage"
import { getPdfViewerHtml } from "@/utils/pdfViewerHtml"
import { useHeader } from "@/utils/useHeader"

type PickedFile = { uri: string; name: string }

export const PdfViewerScreen: FC<PdfStackScreenProps<"PdfView">> = (props) => {
  const { route, navigation } = props
  const { themed, theme } = useAppTheme()
  const {
    tabs,
    activeTabId,
    addTab,
    removeTab,
    setActiveTab,
    openInCurrentTab,
    updateActiveTabPage,
    clearAllTabs,
  } = usePdfTabs()

  const activeTab = useMemo(
    () => (activeTabId ? (tabs.find((t) => t.id === activeTabId) ?? null) : null),
    [tabs, activeTabId],
  )

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
  const [infoBubbleModalVisible, setInfoBubbleModalVisible] = useState(false)
  const [selectedInfoBubble, setSelectedInfoBubble] = useState<PdfInfoBubble | null>(null)

  const { height: windowHeight } = useWindowDimensions()
  const effectiveFileId = activeTab?.fileId ?? fileId
  const effectivePage = activeTab != null ? activeTab.page : currentPage

  const pdfLinks = useMemo(() => {
    void linksRefreshKey
    return effectiveFileId ? (getPdfLinks(effectiveFileId) ?? []) : []
  }, [effectiveFileId, linksRefreshKey])
  const pdfInfoBubbles = useMemo(() => {
    void linksRefreshKey
    return effectiveFileId ? (getPdfInfoBubbles(effectiveFileId) ?? []) : []
  }, [effectiveFileId, linksRefreshKey])

  useFocusEffect(
    useCallback(() => {
      setLinksRefreshKey((k) => k + 1)
    }, []),
  )

  useHeader(
    {
      titleTx: "pdfViewerScreen:title",
    },
    [],
  )

  const fileIdFromParams = route.params?.fileId
  const pageFromParams = route.params?.page ?? 1
  const uri = picked?.uri ?? null
  const page = effectivePage

  const isLocal = useMemo(() => uri != null && uri.startsWith("file://"), [uri])

  // Only clear local state when user closed the last tab (had tabs, now none).
  // Do NOT clear when tabs.length === 0 and user just picked a file (we need picked to store and add first tab).
  const hadTabsRef = useRef(false)
  useEffect(() => {
    if (tabs.length > 0) hadTabsRef.current = true
    if (tabs.length === 0 && hadTabsRef.current) {
      hadTabsRef.current = false
      setPicked(null)
      setFileId(null)
      setBase64(null)
      setBase64Error(null)
      setCurrentPage(1)
    }
  }, [tabs.length])

  // Sync picked/fileId from active tab when tab-driven.
  // Only update (and clear base64) when the stored URI actually differs from current picked,
  // so redundant runs (same tab, new object reference) don't wipe base64 and cause stuck loading.
  useEffect(() => {
    if (activeTab) {
      const stored = getPdfFile(activeTab.fileId)
      const uriChanged = stored && stored.uri !== picked?.uri
      if (stored && uriChanged) {
        setPicked({ uri: stored.uri, name: stored.name })
        setFileId(activeTab.fileId)
        setBase64(null)
        setBase64Error(null)
      } else if (!stored) {
        setBase64Error(translate("pdfViewerScreen:fileNotFound"))
      }
    }
  }, [activeTab, picked?.uri])

  // Deep link / QR: add a tab for params and clear params
  useEffect(() => {
    if (!fileIdFromParams || !pageFromParams) return
    const stored = getPdfFile(fileIdFromParams)
    if (stored) {
      addTab({ fileId: fileIdFromParams, page: pageFromParams })
      navigation.setParams({ uri: undefined, fileId: undefined, page: undefined } as object)
    } else {
      setBase64Error(translate("pdfViewerScreen:fileNotFound"))
    }
  }, [fileIdFromParams, pageFromParams, addTab, navigation])

  // First pick: when we have fileId and picked with no tabs, add the first tab
  useEffect(() => {
    if (tabs.length === 0 && fileId != null && picked != null) {
      addTab({ fileId, page: 1 })
    }
  }, [tabs.length, fileId, picked, addTab])

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
    clearAllTabs()
    setPicked(null)
    setBase64(null)
    setBase64Error(null)
    setWebViewReady(false)
    setFileId(null)
    setCurrentPage(1)
    navigation.setParams({ uri: undefined, fileId: undefined, page: undefined } as object)
  }, [navigation, clearAllTabs])

  const handleWebViewMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      try {
        const message = JSON.parse(event.nativeEvent.data)
        if (message.type === "pageChanged" && typeof message.page === "number") {
          setCurrentPage(message.page)
          updateActiveTabPage(message.page)
        }
        if (
          message.type === "linkClicked" &&
          Array.isArray(message.destinations) &&
          message.destinations.length > 0
        ) {
          setDestinationChoices(message.destinations as PdfLinkDestination[])
          setDestinationModalVisible(true)
        }
        if (message.type === "infoBubbleClicked" && typeof message.text === "string") {
          setSelectedInfoBubble({
            id: typeof message.infoBubbleId === "string" ? message.infoBubbleId : "preview",
            page: currentPage,
            position: { x: 0, y: 0 },
            text: message.text,
          })
          setInfoBubbleModalVisible(true)
        }
      } catch {
        // Ignore parse errors
      }
    },
    [currentPage, updateActiveTabPage],
  )

  const closeDestinationModal = useCallback(() => {
    setDestinationModalVisible(false)
    setDestinationChoices(null)
  }, [])

  const closeInfoBubbleModal = useCallback(() => {
    setInfoBubbleModalVisible(false)
    setSelectedInfoBubble(null)
  }, [])

  const openDestinationInNewTab = useCallback(
    (d: PdfLinkDestination) => {
      if (effectiveFileId != null) {
        addTab({ fileId: effectiveFileId, page: d.page, title: d.title })
      }
      closeDestinationModal()
    },
    [effectiveFileId, addTab, closeDestinationModal],
  )

  const generateDeepLinkUrl = useCallback(() => {
    if (!effectiveFileId || !effectivePage) return null
    const scheme = "mohamed-anwar"
    return `${scheme}://Demo/PdfViewer?fileId=${encodeURIComponent(effectiveFileId)}&page=${effectivePage}`
  }, [effectiveFileId, effectivePage])

  const handleGenerateQr = useCallback(() => {
    if (!effectiveFileId || !effectivePage) {
      setQrError(translate("pdfViewerScreen:qrError"))
      return
    }
    setQrError(null)
    setQrSaved(false)
    setShowQrModal(true)
  }, [effectiveFileId, effectivePage])

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
      infoBubbles: pdfInfoBubbles.length > 0 ? pdfInfoBubbles : undefined,
    })
  }, [uri, base64, base64Error, isLocal, page, pdfLinks, pdfInfoBubbles])

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
    <Screen
      preset="fixed"
      contentContainerStyle={$styles.flex1}
      safeAreaEdges={tabs.length > 1 ? [] : ["top"]}
    >
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
          <Text tx="common:loadingPdf" style={themed($loadingText)} />
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
          {tabs.length > 1 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={true}
              contentContainerStyle={themed($tabBarScroll)}
              style={themed($tabBarContainer)}
              contentInsetAdjustmentBehavior="never"
            >
              {tabs.map((tab) => (
                <TouchableOpacity
                  key={tab.id}
                  style={themed([$tabChip, tab.id === activeTabId && $tabChipActive])}
                  onPress={() => setActiveTab(tab.id)}
                  activeOpacity={0.7}
                >
                  <View style={themed($tabChipLabelWrap)}>
                    <Text
                      text={
                        tab.title ??
                        translate("pdfViewerScreen:tabPageLabel", { page: tab.page })
                      }
                      preset="default"
                      style={themed($tabChipText)}
                      numberOfLines={1}
                    />
                  </View>
                  <TouchableOpacity
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    onPress={(e) => {
                      e.stopPropagation()
                      removeTab(tab.id)
                    }}
                    style={themed($tabCloseWrap)}
                    accessibilityLabel={translate("pdfViewerScreen:closeTab")}
                  >
                    <View style={themed($tabCloseIconContainer)}>
                      <Icon icon="x" size={16} color={theme.colors.text} />
                    </View>
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
          <WebView
            key={`pdf-${effectiveFileId ?? ""}-${page}-${pdfLinks.length}-${pdfInfoBubbles.length}-${linksRefreshKey}`}
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
                  navigation.navigate("PdfLinkEditor", { fileId: effectiveFileId ?? undefined })
                }
                disabled={!effectiveFileId || isStoring}
                style={themed($toolbarButton)}
                textStyle={themed($toolbarButtonText)}
              />
              <Button
                tx="pdfViewerScreen:generateQr"
                onPress={handleGenerateQr}
                disabled={!effectiveFileId || isStoring}
                style={themed($toolbarButton)}
                textStyle={themed($toolbarButtonText)}
              />
              <Button
                tx="pdfViewerScreen:selectAnother"
                onPress={clearAndPickAnother}
                style={themed($toolbarButton)}
                textStyle={themed($toolbarButtonText)}
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
          <TouchableOpacity
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
            style={styles.destinationModalWrapper}
          >
            <View style={themed($destinationModalContent)}>
              <Text
                preset="heading"
                tx="pdfViewerScreen:chooseDestination"
                style={themed($destinationModalTitle)}
              />
              <FlatList
                data={destinationChoices ?? []}
                keyExtractor={(item, index) => `${item.page}-${item.title}-${index}`}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={themed($destinationItem)}
                    onPress={() => openDestinationInNewTab(item)}
                    activeOpacity={0.7}
                  >
                    <Text
                      text={translate("pdfViewerScreen:destinationOption", {
                        title: item.title,
                        page: item.page,
                      })}
                      preset="default"
                      style={themed($destinationItemText)}
                    />
                  </TouchableOpacity>
                )}
                style={[
                  themed($destinationList),
                  {
                    minHeight: 160,
                    maxHeight: Math.round(windowHeight * 0.6),
                  },
                ]}
              />
              <Button
                tx="pdfViewerScreen:close"
                onPress={closeDestinationModal}
                style={themed($cancelQrButton)}
              />
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={infoBubbleModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeInfoBubbleModal}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.modalOverlay, themed($modalOverlay)]}
          onPress={closeInfoBubbleModal}
        >
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
            <View style={themed($infoBubbleModalContent)}>
              <Text text="معلومة" preset="heading" style={themed($destinationModalTitle)} />
              <Text
                text={selectedInfoBubble?.text ?? "لا يوجد نص معلومة."}
                preset="default"
                style={themed($infoBubbleText)}
              />
              <Button
                tx="common:cancel"
                onPress={closeInfoBubbleModal}
                style={themed($cancelQrButton)}
              />
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
  destinationModalWrapper: {
    width: "100%",
    maxWidth: 400,
    alignSelf: "stretch",
  },
})

const $webview: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.transparent,
  flex: 1,
  minHeight: 0,
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

const $toolbar: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: I18nManager.isRTL ? "row-reverse" : "row",
  flexShrink: 0,
  alignItems: "center",
  justifyContent: "space-evenly",
  paddingVertical: spacing.xs,
  paddingHorizontal: spacing.sm,
  borderTopWidth: StyleSheet.hairlineWidth,
  borderTopColor: colors.palette.neutral400,
})

const $toolbarButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  marginHorizontal: spacing.xs,
  minHeight: 40,
  paddingVertical: spacing.xs,
  paddingHorizontal: spacing.sm,
})

const $toolbarButtonText: ThemedStyle<TextStyle> = ({ typography }) => ({
  fontSize: 13,
  fontFamily: typography.primary.medium,
})

const $loadingText: ThemedStyle<TextStyle> = ({ spacing }) => ({
  marginTop: spacing.md,
})

const $errorText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.error,
  marginBottom: 16,
  textAlign: "center",
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

const $infoBubbleModalContent: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  alignItems: "stretch",
  backgroundColor: colors.background,
  borderRadius: 16,
  padding: spacing.xl,
  width: "100%",
  maxWidth: 400,
})

const $destinationModalTitle: ThemedStyle<TextStyle> = ({ spacing }) => ({
  marginBottom: spacing.md,
})

const $infoBubbleText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.text,
  marginBottom: spacing.lg,
  lineHeight: 22,
})

const $destinationList: ThemedStyle<ViewStyle> = ({ spacing }) => ({
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

const $tabBarContainer: ThemedStyle<ViewStyle> = ({ colors }) => ({
  flexGrow: 0,
  flexShrink: 0,
  borderBottomWidth: StyleSheet.hairlineWidth,
  borderBottomColor: colors.palette.neutral400,
})

const $tabBarScroll: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingVertical: spacing.sm,
  paddingHorizontal: spacing.sm,
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
})

const $tabChip: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: I18nManager.isRTL ? "row-reverse" : "row",
  alignItems: "center",
  paddingVertical: spacing.xs,
  paddingLeft: I18nManager.isRTL ? spacing.xs : spacing.sm,
  paddingRight: I18nManager.isRTL ? spacing.sm : spacing.xs,
  borderRadius: 8,
  backgroundColor: colors.palette.neutral200,
  maxWidth: 160,
  flexShrink: 0,
})

const $tabChipActive: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.palette.primary100,
})

const $tabChipLabelWrap: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  minWidth: 0,
  justifyContent: "center",
})

const $tabChipText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
  fontSize: 14,
})

const $tabCloseWrap: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexShrink: 0,
  marginLeft: I18nManager.isRTL ? 0 : spacing.xs,
  marginRight: I18nManager.isRTL ? spacing.xs : 0,
  justifyContent: "center",
  alignItems: "center",
})

const $tabCloseIconContainer: ThemedStyle<ViewStyle> = () => ({
  width: 24,
  height: 24,
  justifyContent: "center",
  alignItems: "center",
})

import { FC, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  I18nManager,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native"
import { randomUUID } from "expo-crypto"
import * as DocumentPicker from "expo-document-picker"
import { WebView } from "react-native-webview"

import { Button } from "@/components/Button"
import { EmptyState } from "@/components/EmptyState"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { translate } from "@/i18n/translate"
import { PdfStackScreenProps } from "@/navigators/navigationTypes"
import { useAppTheme } from "@/theme/context"
import { $styles } from "@/theme/styles"
import type { ThemedStyle } from "@/theme/types"
import { getPdfEditorHtml } from "@/utils/pdfEditorHtml"
import {
  addToLibrary,
  getLibraryEntry,
  getLibraryPdfBase64,
  updateLibraryEntryLinks,
} from "@/utils/pdfLibraryStorage"
import type {
  PdfInfoBubble,
  PdfLink,
  PdfLinkDestination,
  PdfLinkRect,
} from "@/utils/pdfLinkStorage"
import { useHeader } from "@/utils/useHeader"

type PickedFile = { uri: string; name: string }

export const PdfLinkEditorScreen: FC<PdfStackScreenProps<"PdfLinkEditor">> = (props) => {
  const { route, navigation } = props
  const { themed, theme } = useAppTheme()
  const [picked, setPicked] = useState<PickedFile | null>(null)
  const [base64, setBase64] = useState<string | null>(null)
  const [base64Error, setBase64Error] = useState<string | null>(null)
  const [fileId, setFileId] = useState<string | null>(null)
  const [isStoring, setIsStoring] = useState(false)
  const [editorLinks, setEditorLinks] = useState<PdfLink[]>([])
  const [editorInfoBubbles, setEditorInfoBubbles] = useState<PdfInfoBubble[]>([])
  const [editorPage, setEditorPage] = useState(1)
  const [editorTotalPages, setEditorTotalPages] = useState<number | null>(null)
  const [pageInputStr, setPageInputStr] = useState("1")
  const [addLinkMode, setAddLinkMode] = useState(false)
  const [addInfoMode, setAddInfoMode] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchInProgress, setSearchInProgress] = useState(false)
  const [searchMatchCount, setSearchMatchCount] = useState(0)
  const [linkFormVisible, setLinkFormVisible] = useState(false)
  const [linkFormPage, setLinkFormPage] = useState(1)
  const [linkFormRect, setLinkFormRect] = useState<PdfLinkRect | null>(null)
  const [linkFormDestinations, setLinkFormDestinations] = useState<
    Array<{ title: string; page: string }>
  >([{ title: "", page: "" }])
  const [infoFormVisible, setInfoFormVisible] = useState(false)
  const [infoFormPage, setInfoFormPage] = useState(1)
  const [infoFormPosition, setInfoFormPosition] = useState<{ x: number; y: number } | null>(null)
  const [infoFormText, setInfoFormText] = useState("")
  const [bulkFormVisible, setBulkFormVisible] = useState(false)
  const [bulkFormMatches, setBulkFormMatches] = useState<
    Array<{ page: number; rect: PdfLinkRect }>
  >([])
  const [bulkFormQuery, setBulkFormQuery] = useState("")
  const [bulkFormDestinations, setBulkFormDestinations] = useState<
    Array<{ title: string; page: string }>
  >([{ title: "", page: "" }])
  const webViewRef = useRef<WebView>(null)
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
    let cancelled = false
    getLibraryEntry(fileIdFromParams).then((entry) => {
      if (cancelled) return
      if (entry) {
        setFileId(fileIdFromParams)
        setEditorLinks(entry.links ?? [])
        setEditorInfoBubbles(entry.infoBubbles ?? [])
        setPicked({ uri: "", name: entry.name })
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
    })
    return () => {
      cancelled = true
    }
  }, [fileIdFromParams])

  useEffect(() => {
    if (!fileId) return
    let cancelled = false
    setBase64Error(null)
    getLibraryPdfBase64(fileId).then((b64) => {
      if (cancelled) return
      if (b64) setBase64(b64)
      else setBase64Error(translate("pdfViewerScreen:fileNotFound"))
    })
    return () => {
      cancelled = true
    }
  }, [fileId])

  useEffect(() => {
    if (fileIdFromParams || fileId || !uri || !isLocal) return
    const storeFile = async () => {
      setIsStoring(true)
      try {
        const storedFileId = await addToLibrary(uri, picked?.name ?? "document.pdf")
        setFileId(storedFileId)
        setEditorLinks([])
        setEditorInfoBubbles([])
      } catch (e) {
        console.warn("Failed to add PDF to library:", e)
        setBase64Error(e instanceof Error ? e.message : "Failed to add to library")
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
          if (typeof message.totalPages === "number") setEditorTotalPages(message.totalPages)
        }
        if (message.type === "editorSearchResults") {
          setSearchInProgress(!!message.inProgress)
          setSearchMatchCount(typeof message.matchCount === "number" ? message.matchCount : 0)
        }
        if (message.type === "linkRectDrawn") {
          const { page, rect } = message
          if (
            typeof page === "number" &&
            rect &&
            typeof rect.x === "number" &&
            typeof rect.y === "number" &&
            typeof rect.width === "number" &&
            typeof rect.height === "number"
          ) {
            setLinkFormPage(page)
            setLinkFormRect(rect)
            setLinkFormDestinations([{ title: "", page: String(editorPage) }])
            setLinkFormVisible(true)
          }
        }
        if (message.type === "infoPositionTapped") {
          const { page, position } = message
          if (
            typeof page === "number" &&
            position &&
            typeof position.x === "number" &&
            typeof position.y === "number"
          ) {
            setInfoFormPage(page)
            setInfoFormPosition({ x: position.x, y: position.y })
            setInfoFormText("")
            setInfoFormVisible(true)
          }
        }
        if (message.type === "bulkFormData" && Array.isArray(message.matches)) {
          const matches = message.matches.filter(
            (m: { page?: number; rect?: PdfLinkRect }) =>
              typeof m?.page === "number" &&
              m?.rect &&
              typeof m.rect.x === "number" &&
              typeof m.rect.y === "number" &&
              typeof m.rect.width === "number" &&
              typeof m.rect.height === "number",
          ) as Array<{ page: number; rect: PdfLinkRect }>
          if (matches.length > 0) {
            setBulkFormMatches(matches)
            setBulkFormQuery(typeof message.query === "string" ? message.query : "")
            setBulkFormDestinations([{ title: "", page: String(editorPage) }])
            setBulkFormVisible(true)
          }
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
            const newLink: PdfLink = {
              id: randomUUID(),
              page,
              rect,
              destinations,
            }
            const newLinks = [...editorLinks, newLink]
            setEditorLinks(newLinks)
            updateLibraryEntryLinks(fileId, newLinks, editorInfoBubbles)
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
            const newBubble: PdfInfoBubble = {
              id: randomUUID(),
              page,
              position: {
                x: Math.max(0, Math.min(1, position.x)),
                y: Math.max(0, Math.min(1, position.y)),
              },
              text: text.trim(),
            }
            const newBubbles = [...editorInfoBubbles, newBubble]
            setEditorInfoBubbles(newBubbles)
            updateLibraryEntryLinks(fileId, editorLinks, newBubbles)
          }
        }
        if (message.type === "bulkLinksSaved" && fileId && Array.isArray(message.links)) {
          const added: PdfLink[] = []
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
              added.push({
                id: randomUUID(),
                page,
                rect,
                destinations,
              })
            }
          }
          if (added.length > 0) {
            const newLinks = [...editorLinks, ...added]
            setEditorLinks(newLinks)
            updateLibraryEntryLinks(fileId, newLinks, editorInfoBubbles)
          }
        }
        if (message.type === "bulkResultDismissed" && fileId) {
          pageForLoadRef.current = editorPage
          setSearchMatchCount(0)
        }
      } catch {
        // Ignore parse errors
      }
    },
    [fileId, editorPage, editorLinks, editorInfoBubbles],
  )

  useEffect(() => {
    setPageInputStr(String(editorPage))
  }, [editorPage])

  const handleEditorPrevPage = useCallback(() => {
    webViewRef.current?.injectJavaScript("window.editorPrevPage && window.editorPrevPage();")
  }, [])
  const handleEditorNextPage = useCallback(() => {
    webViewRef.current?.injectJavaScript("window.editorNextPage && window.editorNextPage();")
  }, [])
  const handleEditorPageSubmit = useCallback(() => {
    const p = Math.max(
      1,
      editorTotalPages != null
        ? Math.min(editorTotalPages, parseInt(pageInputStr, 10) || 1)
        : parseInt(pageInputStr, 10) || 1,
    )
    setPageInputStr(String(p))
    webViewRef.current?.injectJavaScript(`window.editorGoToPage && window.editorGoToPage(${p});`)
  }, [pageInputStr, editorTotalPages])
  const handleAddLink = useCallback(() => {
    const next = !addLinkMode
    setAddLinkMode(next)
    setAddInfoMode(false)
    webViewRef.current?.injectJavaScript(`window.setAddLinkMode && window.setAddLinkMode(${next});`)
  }, [addLinkMode])
  const handleAddInfo = useCallback(() => {
    const next = !addInfoMode
    setAddInfoMode(next)
    setAddLinkMode(false)
    webViewRef.current?.injectJavaScript(`window.setAddInfoMode && window.setAddInfoMode(${next});`)
  }, [addInfoMode])
  const handleSearch = useCallback(() => {
    const q = JSON.stringify(searchQuery || "")
    webViewRef.current?.injectJavaScript(`window.performSearch && window.performSearch(${q});`)
  }, [searchQuery])
  const handleLinkAll = useCallback(() => {
    webViewRef.current?.injectJavaScript("window.showBulkForm && window.showBulkForm();")
  }, [])

  const parseDestinations = useCallback(
    (rows: Array<{ title: string; page: string }>): PdfLinkDestination[] =>
      rows
        .map((r) => ({
          title: r.title.trim(),
          page: Math.max(1, parseInt(r.page, 10) || 1),
        }))
        .filter((d) => d.title.length > 0),
    [],
  )

  const closeLinkForm = useCallback(() => {
    setLinkFormVisible(false)
    setLinkFormRect(null)
    webViewRef.current?.injectJavaScript("window.setAddLinkMode && window.setAddLinkMode(false);")
  }, [])

  const saveLinkForm = useCallback(() => {
    if (!fileId || !linkFormRect) return
    const destinations = parseDestinations(linkFormDestinations)
    if (destinations.length === 0) return
    pageForLoadRef.current = editorPage
    const newLink: PdfLink = {
      id: randomUUID(),
      page: linkFormPage,
      rect: linkFormRect,
      destinations,
    }
    const newLinks = [...editorLinks, newLink]
    setEditorLinks(newLinks)
    updateLibraryEntryLinks(fileId, newLinks, editorInfoBubbles)
    setLinkFormVisible(false)
    setLinkFormRect(null)
    webViewRef.current?.injectJavaScript("window.setAddLinkMode && window.setAddLinkMode(false);")
  }, [
    fileId,
    linkFormRect,
    linkFormPage,
    linkFormDestinations,
    editorLinks,
    editorInfoBubbles,
    editorPage,
    parseDestinations,
  ])

  const closeInfoForm = useCallback(() => {
    setInfoFormVisible(false)
    setInfoFormPosition(null)
    webViewRef.current?.injectJavaScript("window.setAddInfoMode && window.setAddInfoMode(false);")
  }, [])

  const saveInfoForm = useCallback(() => {
    if (!fileId || !infoFormPosition || !infoFormText.trim()) return
    pageForLoadRef.current = editorPage
    const newBubble: PdfInfoBubble = {
      id: randomUUID(),
      page: infoFormPage,
      position: {
        x: Math.max(0, Math.min(1, infoFormPosition.x)),
        y: Math.max(0, Math.min(1, infoFormPosition.y)),
      },
      text: infoFormText.trim(),
    }
    const newBubbles = [...editorInfoBubbles, newBubble]
    setEditorInfoBubbles(newBubbles)
    updateLibraryEntryLinks(fileId, editorLinks, newBubbles)
    setInfoFormVisible(false)
    setInfoFormPosition(null)
    setInfoFormText("")
    webViewRef.current?.injectJavaScript("window.setAddInfoMode && window.setAddInfoMode(false);")
  }, [
    fileId,
    infoFormPage,
    infoFormPosition,
    infoFormText,
    editorLinks,
    editorInfoBubbles,
    editorPage,
  ])

  const closeBulkForm = useCallback(() => {
    setBulkFormVisible(false)
    setBulkFormMatches([])
  }, [])

  const saveBulkForm = useCallback(() => {
    if (!fileId || bulkFormMatches.length === 0) return
    const destinations = parseDestinations(bulkFormDestinations)
    if (destinations.length === 0) return
    const added: PdfLink[] = bulkFormMatches.map((m) => ({
      id: randomUUID(),
      page: m.page,
      rect: m.rect,
      destinations,
    }))
    const newLinks = [...editorLinks, ...added]
    setEditorLinks(newLinks)
    updateLibraryEntryLinks(fileId, newLinks, editorInfoBubbles)
    setBulkFormVisible(false)
    setBulkFormMatches([])
    webViewRef.current?.injectJavaScript(
      "window.clearSearchAndNotify && window.clearSearchAndNotify();",
    )
    setSearchMatchCount(0)
    Alert.alert(translate("pdfLinkEditorScreen:createdLinksCount", { count: added.length }))
  }, [
    fileId,
    bulkFormMatches,
    bulkFormDestinations,
    editorLinks,
    editorInfoBubbles,
    parseDestinations,
  ])

  const searchStatusText = searchInProgress
    ? translate("pdfLinkEditorScreen:searchSearching")
    : searchMatchCount > 0
      ? translate("pdfLinkEditorScreen:searchResults", { count: searchMatchCount })
      : searchQuery
        ? translate("pdfLinkEditorScreen:searchNoResults")
        : "—"

  const html = useMemo(() => {
    if (!base64) return null
    if (base64Error) return null
    return getPdfEditorHtml({
      base64,
      page: pageForLoadRef.current,
      links: editorLinks,
      infoBubbles: editorInfoBubbles,
    })
  }, [base64, base64Error, editorLinks, editorInfoBubbles])

  const isLoadingBase64 =
    (fileId != null || fileIdFromParams != null) && base64 == null && base64Error == null
  const showEditor = html != null && fileId != null && !isLoadingBase64 && !base64Error
  const showEmpty = !fileId && !fileIdFromParams && !isLoadingBase64 && !isStoring

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
          <View style={themed($editorToolbar)}>
            <View style={themed($editorToolbarRow)}>
              <Button
                tx="pdfViewerScreen:prevPage"
                onPress={handleEditorPrevPage}
                disabled={editorPage <= 1}
                style={themed($editorNavBtn)}
                textStyle={themed($editorToolbarText)}
              />
              <TextField
                style={themed($editorPageInput)}
                value={pageInputStr}
                onChangeText={setPageInputStr}
                onSubmitEditing={handleEditorPageSubmit}
                onBlur={handleEditorPageSubmit}
                keyboardType="number-pad"
              />
              <Text style={themed($editorToolbarText)}>
                {" / "}
                {editorTotalPages != null ? editorTotalPages : "—"}
              </Text>
              <Button
                tx="pdfViewerScreen:nextPage"
                onPress={handleEditorNextPage}
                disabled={editorTotalPages != null && editorPage >= editorTotalPages}
                style={themed($editorNavBtn)}
                textStyle={themed($editorToolbarText)}
              />
              <Button
                tx="pdfLinkEditorScreen:addLink"
                onPress={handleAddLink}
                style={[themed($editorNavBtn), addLinkMode && themed($editorBtnActive)]}
                textStyle={themed($editorToolbarText)}
              />
              <Button
                tx="pdfLinkEditorScreen:addInfo"
                onPress={handleAddInfo}
                style={[themed($editorNavBtn), addInfoMode && themed($editorBtnActiveInfo)]}
                textStyle={themed($editorToolbarText)}
              />
            </View>
            <View style={themed($editorToolbarRow)}>
              <TextField
                style={themed($editorSearchInput)}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder={translate("pdfLinkEditorScreen:searchPlaceholder")}
                placeholderTextColor={theme.colors.textDim}
                onSubmitEditing={handleSearch}
              />
              <Button
                tx="pdfLinkEditorScreen:search"
                onPress={handleSearch}
                style={themed($editorNavBtn)}
                textStyle={themed($editorToolbarText)}
              />
              <Text style={themed($editorSearchStatus)} numberOfLines={1}>
                {searchStatusText}
              </Text>
            </View>
            {searchMatchCount > 0 && (
              <View style={themed($editorToolbarRow)}>
                <Button
                  tx="pdfLinkEditorScreen:linkAllResults"
                  onPress={handleLinkAll}
                  style={themed($editorLinkAllBtn)}
                  textStyle={themed($editorToolbarText)}
                />
              </View>
            )}
          </View>
          <WebView
            ref={webViewRef}
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

      <Modal
        visible={linkFormVisible}
        transparent
        animationType="fade"
        onRequestClose={closeLinkForm}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.modalOverlay, themed($modalOverlay)]}
          onPress={closeLinkForm}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
            style={styles.modalContentWrap}
          >
            <View style={themed($formModalContent)}>
              <Text
                preset="heading"
                tx="pdfLinkEditorScreen:saveLink"
                style={themed($formModalTitle)}
              />
              <ScrollView style={themed($formModalScroll)} keyboardShouldPersistTaps="handled">
                {linkFormDestinations.map((dest, idx) => (
                  <View key={idx} style={themed($destinationRow)}>
                    <TextField
                      style={themed($destinationTitleInput)}
                      value={dest.title}
                      onChangeText={(t) =>
                        setLinkFormDestinations((prev) => {
                          const next = [...prev]
                          next[idx] = { ...next[idx], title: t }
                          return next
                        })
                      }
                      placeholder={translate("pdfLinkEditorScreen:destinationTitlePlaceholder")}
                      placeholderTextColor={theme.colors.textDim}
                    />
                    <TextField
                      style={themed($destinationPageInput)}
                      value={dest.page}
                      onChangeText={(t) =>
                        setLinkFormDestinations((prev) => {
                          const next = [...prev]
                          next[idx] = { ...next[idx], page: t }
                          return next
                        })
                      }
                      placeholder="ص"
                      placeholderTextColor={theme.colors.textDim}
                      keyboardType="number-pad"
                    />
                  </View>
                ))}
              </ScrollView>
              <Button
                tx="pdfLinkEditorScreen:addDestination"
                onPress={() =>
                  setLinkFormDestinations((prev) => [
                    ...prev,
                    { title: "", page: String(editorPage) },
                  ])
                }
                style={themed($formModalAddBtn)}
              />
              <View style={themed($formModalButtons)}>
                <Button tx="common:cancel" onPress={closeLinkForm} style={themed($formCancelBtn)} />
                <Button
                  tx="pdfLinkEditorScreen:saveLink"
                  onPress={saveLinkForm}
                  style={themed($formSaveBtn)}
                />
              </View>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={infoFormVisible}
        transparent
        animationType="fade"
        onRequestClose={closeInfoForm}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.modalOverlay, themed($modalOverlay)]}
          onPress={closeInfoForm}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
            style={styles.modalContentWrap}
          >
            <View style={themed($formModalContent)}>
              <Text
                preset="heading"
                tx="pdfLinkEditorScreen:addInfo"
                style={themed($formModalTitle)}
              />
              <TextField
                style={themed($infoTextInput)}
                value={infoFormText}
                onChangeText={setInfoFormText}
                placeholder={translate("pdfLinkEditorScreen:infoPlaceholder")}
                placeholderTextColor={theme.colors.textDim}
                multiline
              />
              <View style={themed($formModalButtons)}>
                <Button tx="common:cancel" onPress={closeInfoForm} style={themed($formCancelBtn)} />
                <Button
                  tx="pdfLinkEditorScreen:saveInfo"
                  onPress={saveInfoForm}
                  style={themed($formSaveBtn)}
                />
              </View>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={bulkFormVisible}
        transparent
        animationType="fade"
        onRequestClose={closeBulkForm}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.modalOverlay, themed($modalOverlay)]}
          onPress={closeBulkForm}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
            style={styles.modalContentWrap}
          >
            <View style={themed($formModalContent)}>
              <Text
                preset="heading"
                tx="pdfLinkEditorScreen:linkAllResults"
                style={themed($formModalTitle)}
              />
              {bulkFormQuery ? (
                <Text
                  text={`"${bulkFormQuery}" – ${translate("pdfLinkEditorScreen:searchResults", {
                    count: bulkFormMatches.length,
                  })}`}
                  preset="default"
                  style={themed($formModalSubtitle)}
                />
              ) : null}
              <ScrollView style={themed($formModalScroll)} keyboardShouldPersistTaps="handled">
                {bulkFormDestinations.map((dest, idx) => (
                  <View key={idx} style={themed($destinationRow)}>
                    <TextField
                      style={themed($destinationTitleInput)}
                      value={dest.title}
                      onChangeText={(t) =>
                        setBulkFormDestinations((prev) => {
                          const next = [...prev]
                          next[idx] = { ...next[idx], title: t }
                          return next
                        })
                      }
                      placeholder={translate("pdfLinkEditorScreen:destinationTitlePlaceholder")}
                      placeholderTextColor={theme.colors.textDim}
                    />
                    <TextField
                      style={themed($destinationPageInput)}
                      value={dest.page}
                      onChangeText={(t) =>
                        setBulkFormDestinations((prev) => {
                          const next = [...prev]
                          next[idx] = { ...next[idx], page: t }
                          return next
                        })
                      }
                      placeholder="ص"
                      placeholderTextColor={theme.colors.textDim}
                      keyboardType="number-pad"
                    />
                  </View>
                ))}
              </ScrollView>
              <Button
                tx="pdfLinkEditorScreen:addDestination"
                onPress={() =>
                  setBulkFormDestinations((prev) => [
                    ...prev,
                    { title: "", page: String(editorPage) },
                  ])
                }
                style={themed($formModalAddBtn)}
              />
              <View style={themed($formModalButtons)}>
                <Button tx="common:cancel" onPress={closeBulkForm} style={themed($formCancelBtn)} />
                <Button
                  tx="pdfLinkEditorScreen:saveLink"
                  onPress={saveBulkForm}
                  style={themed($formSaveBtn)}
                />
              </View>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
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

const $editorToolbar: ThemedStyle<ViewStyle> = ({ colors }) => ({
  flexDirection: "column",
  flexShrink: 0,
  backgroundColor: colors.palette.neutral800,
  paddingVertical: 8,
  paddingHorizontal: 8,
  gap: 6,
  borderBottomWidth: StyleSheet.hairlineWidth,
  borderBottomColor: colors.palette.neutral400,
})

const $editorToolbarRow: ThemedStyle<ViewStyle> = () => ({
  flexDirection: I18nManager.isRTL ? "row-reverse" : "row",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  flexWrap: "wrap",
})

const $editorNavBtn: ThemedStyle<ViewStyle> = ({ spacing: _spacing }) => ({
  minHeight: 40,
  paddingVertical: 6,
  paddingHorizontal: 10,
})

const $editorToolbarText: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  fontSize: 13,
  fontFamily: typography.primary.medium,
  color: colors.text,
})

const $editorPageInput: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  fontSize: 14,
  fontFamily: typography.primary.medium,
  color: colors.text,
  backgroundColor: colors.palette.neutral200,
  borderWidth: 1,
  borderColor: colors.palette.neutral400,
  borderRadius: 6,
  paddingVertical: 6,
  paddingHorizontal: 10,
  minWidth: 44,
  textAlign: "center",
})

const $editorBtnActive: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.palette.primary500,
})

const $editorBtnActiveInfo: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.palette.secondary500,
})

const $editorSearchInput: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  flex: 1,
  minWidth: 100,
  maxWidth: 180,
  fontSize: 14,
  fontFamily: typography.primary.medium,
  color: colors.text,
  backgroundColor: colors.palette.neutral200,
  borderWidth: 1,
  borderColor: colors.palette.neutral400,
  borderRadius: 6,
  paddingVertical: 6,
  paddingHorizontal: 10,
})

const $editorSearchStatus: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  fontSize: 12,
  fontFamily: typography.primary.medium,
  color: colors.textDim,
  minWidth: 60,
  textAlign: "center",
})

const $editorLinkAllBtn: ThemedStyle<ViewStyle> = ({ colors }) => ({
  minHeight: 40,
  paddingVertical: 6,
  paddingHorizontal: 14,
  backgroundColor: colors.palette.secondary500,
})

const styles = StyleSheet.create({
  modalContentWrap: {
    alignSelf: "stretch",
    maxWidth: 400,
    width: "100%",
  },
  modalOverlay: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
})

const $modalOverlay: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.palette.overlay50,
})

const $formModalContent: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.background,
  borderRadius: 16,
  padding: spacing.xl,
  maxHeight: "90%",
})

const $formModalTitle: ThemedStyle<TextStyle> = ({ spacing }) => ({
  marginBottom: spacing.md,
})

const $formModalSubtitle: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  marginBottom: spacing.sm,
  fontSize: 13,
  color: colors.textDim,
})

const $formModalScroll: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  maxHeight: 200,
  marginBottom: spacing.sm,
})

const $destinationRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: I18nManager.isRTL ? "row-reverse" : "row",
  alignItems: "center",
  gap: spacing.sm,
  marginBottom: spacing.sm,
})

const $destinationTitleInput: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  flex: 1,
  fontSize: 14,
  fontFamily: typography.primary.medium,
  color: colors.text,
  backgroundColor: colors.palette.neutral200,
  borderWidth: 1,
  borderColor: colors.palette.neutral400,
  borderRadius: 6,
  paddingVertical: 8,
  paddingHorizontal: 10,
})

const $destinationPageInput: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  width: 56,
  fontSize: 14,
  fontFamily: typography.primary.medium,
  color: colors.text,
  backgroundColor: colors.palette.neutral200,
  borderWidth: 1,
  borderColor: colors.palette.neutral400,
  borderRadius: 6,
  paddingVertical: 8,
  paddingHorizontal: 8,
  textAlign: "center",
})

const $formModalAddBtn: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginBottom: spacing.md,
})

const $formModalButtons: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: I18nManager.isRTL ? "row-reverse" : "row",
  gap: spacing.md,
})

const $formCancelBtn: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $formSaveBtn: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $infoTextInput: ThemedStyle<TextStyle> = ({ colors, typography, spacing }) => ({
  fontSize: 14,
  fontFamily: typography.primary.medium,
  color: colors.text,
  backgroundColor: colors.palette.neutral200,
  borderWidth: 1,
  borderColor: colors.palette.neutral400,
  borderRadius: 6,
  paddingVertical: 8,
  paddingHorizontal: 10,
  minHeight: 80,
  textAlignVertical: "top",
  marginBottom: spacing.md,
})

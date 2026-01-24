import { FC, useCallback, useEffect, useMemo, useState } from "react"
import { ActivityIndicator, Platform, StyleSheet, TextStyle, View, ViewStyle } from "react-native"
import * as DocumentPicker from "expo-document-picker"
import * as FileSystem from "expo-file-system/legacy"
import { WebView } from "react-native-webview"

import { Button } from "@/components/Button"
import { EmptyState } from "@/components/EmptyState"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { DemoTabScreenProps } from "@/navigators/navigationTypes"
import { useAppTheme } from "@/theme/context"
import { $styles } from "@/theme/styles"
import type { ThemedStyle } from "@/theme/types"
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

  useHeader(
    {
      titleTx: "pdfViewerScreen:title",
    },
    [],
  )

  const uriFromParams = route.params?.uri
  const pageFromParams = route.params?.page ?? 1
  const uri = uriFromParams ?? picked?.uri ?? null
  const page = uriFromParams != null ? pageFromParams : 1

  const isLocal = useMemo(() => uri != null && uri.startsWith("file://"), [uri])
  const isRemote = useMemo(
    () => uri != null && (uri.startsWith("https://") || uri.startsWith("http://")),
    [uri],
  )

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
    navigation.setParams({ uri: undefined, page: undefined } as object)
  }, [navigation])

  const html = useMemo(() => {
    if (!uri && !base64) return null
    if (isLocal && !base64 && !base64Error) return null
    if (isLocal && base64Error) return null
    return getPdfViewerHtml({
      uri: isRemote ? (uri ?? undefined) : undefined,
      base64: isLocal && base64 ? base64 : undefined,
      page,
    })
  }, [uri, base64, base64Error, isLocal, isRemote, page])

  const isLoadingBase64 = isLocal && uri != null && base64 == null && base64Error == null
  const showViewer = html != null && !isLoadingBase64
  const showEmpty = uri == null && !isLoadingBase64

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
            source={{ html }}
            style={themed($webview)}
            scrollEnabled
            onLoadEnd={() => setWebViewReady(true)}
            originWhitelist={["*"]}
            mixedContentMode="compatibility"
          />
          {webViewReady && (
            <View style={themed($toolbar)}>
              <Button
                tx="pdfViewerScreen:selectAnother"
                onPress={clearAndPickAnother}
                style={themed($selectAnotherButton)}
              />
            </View>
          )}
        </View>
      )}
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

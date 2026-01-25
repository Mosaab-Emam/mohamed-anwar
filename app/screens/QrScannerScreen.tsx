import { FC, useCallback, useEffect, useState } from "react"
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  TextStyle,
  View,
  ViewStyle,
} from "react-native"
import { CameraView, useCameraPermissions } from "expo-camera"
import * as ImagePicker from "expo-image-picker"
import { decode } from "react-native-qr-kit"

import { Button } from "@/components/Button"
import { EmptyState } from "@/components/EmptyState"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { translate } from "@/i18n/translate"
import { DemoTabScreenProps } from "@/navigators/navigationTypes"
import { useAppTheme } from "@/theme/context"
import { $styles } from "@/theme/styles"
import type { ThemedStyle } from "@/theme/types"
import { getPdfFile } from "@/utils/pdfFileStorage"
import { parseDeepLinkUrl } from "@/utils/parseDeepLinkUrl"
import { useHeader } from "@/utils/useHeader"

export const QrScannerScreen: FC<DemoTabScreenProps<"QrScanner">> = (props) => {
  const { navigation } = props
  const { themed } = useAppTheme()
  const [cameraPermission, requestCameraPermission] = useCameraPermissions()
  const [isScanning, setIsScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [useImagePicker, setUseImagePicker] = useState(false)

  useHeader(
    {
      titleTx: "qrScannerScreen:title",
    },
    [],
  )

  // Request camera permission on mount
  useEffect(() => {
    if (cameraPermission && !cameraPermission.granted && !cameraPermission.canAskAgain) {
      // Permission denied, default to image picker mode
      setUseImagePicker(true)
    }
  }, [cameraPermission])

  const handleBarcodeScanned = useCallback(
    async (event: { data: string }) => {
      if (isScanning) return // Prevent multiple scans

      setIsScanning(true)
      setError(null)

      try {
        const parsed = parseDeepLinkUrl(event.data)
        if (!parsed) {
          setError(translate("qrScannerScreen:invalidQrCode"))
          setIsScanning(false)
          return
        }

        // Verify file exists
        const storedFile = getPdfFile(parsed.fileId)
        if (!storedFile) {
          setError(translate("qrScannerScreen:noFileFound"))
          setIsScanning(false)
          return
        }

        // Navigate to PDF viewer
        navigation.navigate("PdfViewer", {
          fileId: parsed.fileId,
          page: parsed.page,
        })
      } catch (e) {
        setError(translate("qrScannerScreen:error"))
        setIsScanning(false)
      }
    },
    [isScanning, navigation],
  )

  const handlePickImage = useCallback(async () => {
    try {
      // Request media library permissions
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (status !== "granted") {
        setError(translate("qrScannerScreen:cameraPermissionDenied"))
        return
      }

      // Pick image
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.images,
        allowsEditing: false,
        quality: 1,
      })

      if (result.canceled || !result.assets[0]) {
        return
      }

      setIsScanning(true)
      setError(null)

      // Decode QR code from image
      try {
        const decoded = await decode(result.assets[0].uri)
        // react-native-qr-kit returns an array of decoded strings
        if (decoded && Array.isArray(decoded) && decoded.length > 0) {
          const qrData = decoded[0]
          await handleBarcodeScanned({ data: qrData })
        } else if (decoded && typeof decoded === "string") {
          // Handle case where it returns a string directly
          await handleBarcodeScanned({ data: decoded })
        } else {
          setError(translate("qrScannerScreen:invalidQrCode"))
          setIsScanning(false)
        }
      } catch (decodeError) {
        setError(translate("qrScannerScreen:invalidQrCode"))
        setIsScanning(false)
      }
    } catch (e) {
      setError(translate("qrScannerScreen:error"))
      setIsScanning(false)
    }
  }, [handleBarcodeScanned])

  const handleRequestCameraPermission = useCallback(async () => {
    const { granted } = await requestCameraPermission()
    if (granted) {
      setUseImagePicker(false)
      setError(null)
    } else {
      setError(translate("qrScannerScreen:cameraPermissionDenied"))
      setUseImagePicker(true)
    }
  }, [requestCameraPermission])

  const canUseCamera =
    cameraPermission?.granted || (cameraPermission?.canAskAgain && !useImagePicker)

  if (Platform.OS === "web") {
    return (
      <Screen preset="fixed" contentContainerStyle={$styles.flex1} safeAreaEdges={["top"]}>
        <View style={[styles.centered, themed($emptyContainer)]}>
          <Text tx="qrScannerScreen:webUnsupported" preset="subheading" />
          <Button
            tx="qrScannerScreen:pickImage"
            onPress={handlePickImage}
            style={themed($pickImageButton)}
          />
        </View>
      </Screen>
    )
  }

  // Show permission request if needed
  if (!cameraPermission) {
    return (
      <Screen preset="fixed" contentContainerStyle={$styles.flex1} safeAreaEdges={["top"]}>
        <View style={[styles.centered, themed($emptyContainer)]}>
          <ActivityIndicator size="large" />
        </View>
      </Screen>
    )
  }

  // Show camera view or image picker option
  if (canUseCamera && !useImagePicker) {
    return (
      <Screen preset="fixed" contentContainerStyle={$styles.flex1} safeAreaEdges={["top"]}>
        <View style={$styles.flex1}>
          <CameraView
            style={$styles.flex1}
            barcodeScannerSettings={{
              barcodeTypes: ["qr"],
            }}
            onBarcodeScanned={handleBarcodeScanned}
          />
          {isScanning && (
            <View style={themed($scanningOverlay)}>
              <ActivityIndicator size="large" />
              <Text tx="qrScannerScreen:scanning" style={themed($scanningText)} />
            </View>
          )}
          {error && (
            <View style={themed($errorContainer)}>
              <Text text={error} style={themed($errorText)} />
              <Button
                tx="common:ok"
                onPress={() => {
                  setError(null)
                  setIsScanning(false)
                }}
                style={themed($errorButton)}
              />
            </View>
          )}
          <View style={themed($controlsContainer)}>
            <Button
              tx="qrScannerScreen:switchToImagePicker"
              onPress={() => setUseImagePicker(true)}
              style={themed($switchButton)}
            />
          </View>
        </View>
      </Screen>
    )
  }

  // Show image picker option
  return (
    <Screen preset="fixed" contentContainerStyle={$styles.flex1} safeAreaEdges={["top"]}>
      <View style={[styles.centered, themed($emptyContainer)]}>
        <EmptyState
          preset="generic"
          style={themed($emptyState)}
          headingTx="qrScannerScreen:title"
          content={translate("qrScannerScreen:pickImageDescription")}
          buttonTx="qrScannerScreen:pickImage"
          buttonOnPress={handlePickImage}
        />
        {!cameraPermission.granted && cameraPermission.canAskAgain && (
          <Button
            tx="qrScannerScreen:switchToCamera"
            onPress={handleRequestCameraPermission}
            style={themed($switchButton)}
          />
        )}
        {error && (
          <View style={themed($errorContainer)}>
            <Text text={error} style={themed($errorText)} />
            <Button
              tx="common:ok"
              onPress={() => {
                setError(null)
                setIsScanning(false)
              }}
              style={themed($errorButton)}
            />
          </View>
        )}
        {isScanning && (
          <View style={themed($scanningOverlay)}>
            <ActivityIndicator size="large" />
            <Text tx="qrScannerScreen:scanning" style={themed($scanningText)} />
          </View>
        )}
      </View>
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

const $emptyContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingVertical: spacing.xl,
})

const $emptyState: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginBottom: spacing.lg,
})

const $pickImageButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginTop: spacing.md,
})

const $switchButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginTop: spacing.md,
})

const $controlsContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  padding: spacing.lg,
  position: "absolute",
  bottom: 0,
  left: 0,
  right: 0,
})

const $scanningOverlay: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: colors.palette.overlay50,
  alignItems: "center",
  justifyContent: "center",
  gap: spacing.md,
})

const $scanningText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
})

const $errorContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  marginTop: spacing.lg,
  padding: spacing.md,
})

const $errorText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.error,
  marginBottom: spacing.md,
  textAlign: "center",
})

const $errorButton: ThemedStyle<ViewStyle> = () => ({
  minWidth: 100,
})

import React, { Suspense } from "react"
import { TextStyle, ViewStyle } from "react-native"
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { Icon } from "@/components/Icon"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { EpisodeProvider } from "@/context/EpisodeContext"
import { PdfTabsProvider } from "@/context/PdfTabsContext"
import { translate } from "@/i18n/translate"
import { PdfStackNavigator } from "@/navigators/PdfStackNavigator"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import type { DemoTabParamList, DemoTabScreenProps } from "./navigationTypes"

const Tab = createBottomTabNavigator<DemoTabParamList>()

function QrScannerUnavailable() {
  const { themed } = useAppTheme()
  return (
    <Screen preset="fixed" contentContainerStyle={{ flex: 1, justifyContent: "center" }}>
      <Text tx="qrScannerScreen:webUnsupported" style={themed({ textAlign: "center" })} />
    </Screen>
  )
}

// Lazy-load QR scanner; if native module (expo-image-picker) is missing, show fallback
const QrScannerScreenLazy = React.lazy(() =>
  import("@/screens/QrScannerScreen")
    .then((m) => ({ default: m.QrScannerScreen }))
    .catch(() => ({ default: QrScannerUnavailable })),
)

function QrScannerScreenSafe(props: DemoTabScreenProps<"QrScanner">) {
  return (
    <Suspense fallback={null}>
      <QrScannerScreenLazy {...props} />
    </Suspense>
  )
}

function PdfTabProviderWrapper() {
  return (
    <PdfTabsProvider>
      <PdfStackNavigator />
    </PdfTabsProvider>
  )
}

/**
 * This is the main navigator for the demo screens with a bottom tab bar.
 */
export function DemoNavigator() {
  const { bottom } = useSafeAreaInsets()
  const {
    themed,
    theme: { colors },
  } = useAppTheme()

  return (
    <EpisodeProvider>
      <Tab.Navigator
        initialRouteName="PdfViewer"
        screenOptions={{
          headerShown: false,
          tabBarHideOnKeyboard: true,
          tabBarStyle: themed([$tabBar, { height: bottom + 70 }]),
          tabBarActiveTintColor: colors.text,
          tabBarInactiveTintColor: colors.text,
          tabBarLabelStyle: themed($tabBarLabel),
          tabBarItemStyle: themed($tabBarItem),
        }}
      >
        <Tab.Screen
          name="PdfViewer"
          component={PdfTabProviderWrapper}
          options={{
            tabBarLabel: translate("demoNavigator:pdfTab"),
            tabBarIcon: ({ focused }) => (
              <Icon icon="view" color={focused ? colors.tint : colors.tintInactive} size={30} />
            ),
          }}
        />

        <Tab.Screen
          name="QrScanner"
          component={QrScannerScreenSafe}
          options={{
            tabBarLabel: translate("demoNavigator:qrScannerTab"),
            tabBarIcon: ({ focused }) => (
              <Icon icon="view" color={focused ? colors.tint : colors.tintInactive} size={30} />
            ),
          }}
        />
      </Tab.Navigator>
    </EpisodeProvider>
  )
}

const $tabBar: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.background,
  borderTopColor: colors.transparent,
})

const $tabBarItem: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingTop: spacing.md,
})

const $tabBarLabel: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  fontSize: 12,
  fontFamily: typography.primary.medium,
  lineHeight: 16,
  color: colors.text,
})

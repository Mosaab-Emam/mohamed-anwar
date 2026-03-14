import { createNativeStackNavigator } from "@react-navigation/native-stack"

import { PdfLinkEditorScreen } from "@/screens/PdfLinkEditorScreen"
import { PdfViewerScreen } from "@/screens/PdfViewerScreen"
import { useAppTheme } from "@/theme/context"

import type { PdfStackParamList } from "./navigationTypes"

const Stack = createNativeStackNavigator<PdfStackParamList>()

/**
 * Stack navigator for PDF-related screens. PdfLinkEditor is only accessible
 * via the "Add Links" button in PdfViewerScreen.
 */
export function PdfStackNavigator() {
  const {
    theme: { colors },
  } = useAppTheme()

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
      initialRouteName="PdfView"
    >
      <Stack.Screen name="PdfView" component={PdfViewerScreen} />
      <Stack.Screen name="PdfLinkEditor" component={PdfLinkEditorScreen} />
    </Stack.Navigator>
  )
}

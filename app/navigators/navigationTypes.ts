import { ComponentProps } from "react"
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs"
import {
  CompositeScreenProps,
  NavigationContainer,
  NavigatorScreenParams,
} from "@react-navigation/native"
import { NativeStackScreenProps } from "@react-navigation/native-stack"

// Pdf Stack (nested inside PdfViewer tab) - PdfLinkEditor only accessible via button in PdfView
export type PdfStackParamList = {
  PdfView: { uri?: string; fileId?: string; page?: number } | undefined
  PdfLinkEditor: { fileId?: string } | undefined
}

// Demo Tab Navigator types
export type DemoTabParamList = {
  DemoCommunity: undefined
  DemoShowroom: { queryIndex?: string; itemIndex?: string }
  DemoDebug: undefined
  DemoPodcastList: undefined
  PdfViewer: NavigatorScreenParams<PdfStackParamList> | undefined
  QrScanner: undefined
}

// App Stack Navigator types
export type AppStackParamList = {
  Welcome: undefined
  Login: undefined
  Demo: NavigatorScreenParams<DemoTabParamList>
  // 🔥 Your screens go here
  // IGNITE_GENERATOR_ANCHOR_APP_STACK_PARAM_LIST
}

export type AppStackScreenProps<T extends keyof AppStackParamList> = NativeStackScreenProps<
  AppStackParamList,
  T
>

export type DemoTabScreenProps<T extends keyof DemoTabParamList> = CompositeScreenProps<
  BottomTabScreenProps<DemoTabParamList, T>,
  AppStackScreenProps<keyof AppStackParamList>
>

// Screens inside PdfStack (PdfView, PdfLinkEditor)
export type PdfStackScreenProps<T extends keyof PdfStackParamList> = CompositeScreenProps<
  NativeStackScreenProps<PdfStackParamList, T>,
  CompositeScreenProps<
    BottomTabScreenProps<DemoTabParamList, "PdfViewer">,
    AppStackScreenProps<keyof AppStackParamList>
  >
>

export interface NavigationProps extends Partial<
  ComponentProps<typeof NavigationContainer<AppStackParamList>>
> {}

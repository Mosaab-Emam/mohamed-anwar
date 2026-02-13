import { I18nManager } from "react-native"
import i18n from "i18next"
import { initReactI18next } from "react-i18next"
import "intl-pluralrules"

// if English isn't your default language, move Translations to the appropriate language file.
import ar from "./ar"
import en, { Translations } from "./en"

const forcedLocale = "ar"
const fallbackLocale = "ar"

const resources = { ar, en }
export let isRTL = true

// Force Arabic + RTL across the whole app.
I18nManager.allowRTL(true)
I18nManager.forceRTL(true)
I18nManager.swapLeftAndRightInRTL(true)

export const initI18n = async () => {
  i18n.use(initReactI18next)

  await i18n.init({
    resources,
    lng: forcedLocale,
    fallbackLng: fallbackLocale,
    interpolation: {
      escapeValue: false,
    },
  })

  return i18n
}

/**
 * Builds up valid keypaths for translations.
 */

export type TxKeyPath = RecursiveKeyOf<Translations>

// via: https://stackoverflow.com/a/65333050
type RecursiveKeyOf<TObj extends object> = {
  [TKey in keyof TObj & (string | number)]: RecursiveKeyOfHandleValue<TObj[TKey], `${TKey}`, true>
}[keyof TObj & (string | number)]

type RecursiveKeyOfInner<TObj extends object> = {
  [TKey in keyof TObj & (string | number)]: RecursiveKeyOfHandleValue<TObj[TKey], `${TKey}`, false>
}[keyof TObj & (string | number)]

type RecursiveKeyOfHandleValue<
  TValue,
  Text extends string,
  IsFirstLevel extends boolean,
> = TValue extends any[]
  ? Text
  : TValue extends object
    ? IsFirstLevel extends true
      ? Text | `${Text}:${RecursiveKeyOfInner<TValue>}`
      : Text | `${Text}.${RecursiveKeyOfInner<TValue>}`
    : Text

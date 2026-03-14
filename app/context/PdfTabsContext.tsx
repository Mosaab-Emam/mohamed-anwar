import {
  createContext,
  FC,
  PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react"
import { randomUUID } from "expo-crypto"

export interface PdfViewerTab {
  id: string
  fileId: string
  page: number
  title?: string
}

export type PdfTabsContextType = {
  tabs: PdfViewerTab[]
  activeTabId: string | null
  addTab: (tab: Omit<PdfViewerTab, "id">) => string
  removeTab: (id: string) => void
  setActiveTab: (id: string) => void
  openInCurrentTab: (fileId: string, page: number) => void
  updateActiveTabPage: (page: number) => void
  clearAllTabs: () => void
}

export const PdfTabsContext = createContext<PdfTabsContextType | null>(null)

export interface PdfTabsProviderProps {}

export const PdfTabsProvider: FC<PropsWithChildren<PdfTabsProviderProps>> = ({ children }) => {
  const [tabs, setTabs] = useState<PdfViewerTab[]>([])
  const [activeTabId, setActiveTabIdState] = useState<string | null>(null)

  const addTab = useCallback((tab: Omit<PdfViewerTab, "id">) => {
    const id = randomUUID()
    const newTab: PdfViewerTab = { ...tab, id }
    setTabs((prev) => [...prev, newTab])
    setActiveTabIdState(id)
    return id
  }, [])

  const removeTab = useCallback(
    (id: string) => {
      const remaining = tabs.filter((t) => t.id !== id)
      const removedIdx = tabs.findIndex((t) => t.id === id)
      const nextActive =
        activeTabId === id && remaining.length > 0
          ? (remaining[Math.min(removedIdx, remaining.length - 1)]?.id ?? null)
          : activeTabId === id
            ? null
            : activeTabId
      setTabs(remaining)
      setActiveTabIdState(nextActive)
    },
    [tabs, activeTabId],
  )

  const setActiveTab = useCallback((id: string) => {
    setActiveTabIdState(id)
  }, [])

  const openInCurrentTab = useCallback(
    (fileId: string, page: number) => {
      setTabs((prev) => prev.map((t) => (t.id === activeTabId ? { ...t, fileId, page } : t)))
    },
    [activeTabId],
  )

  const updateActiveTabPage = useCallback(
    (page: number) => {
      if (!activeTabId) return
      setTabs((prev) => prev.map((t) => (t.id === activeTabId ? { ...t, page } : t)))
    },
    [activeTabId],
  )

  const clearAllTabs = useCallback(() => {
    setTabs([])
    setActiveTabIdState(null)
  }, [])

  const value = useMemo<PdfTabsContextType>(
    () => ({
      tabs,
      activeTabId,
      addTab,
      removeTab,
      setActiveTab,
      openInCurrentTab,
      updateActiveTabPage,
      clearAllTabs,
    }),
    [
      tabs,
      activeTabId,
      addTab,
      removeTab,
      setActiveTab,
      openInCurrentTab,
      updateActiveTabPage,
      clearAllTabs,
    ],
  )

  return <PdfTabsContext.Provider value={value}>{children}</PdfTabsContext.Provider>
}

export const usePdfTabs = () => {
  const context = useContext(PdfTabsContext)
  if (!context) throw new Error("usePdfTabs must be used within a PdfTabsProvider")
  return context
}

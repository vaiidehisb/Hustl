"use client"

import { create } from "zustand"

export type UnreadKind = "messages" | "notifications"

type UiState = {
  unread: Record<UnreadKind, number>
  activeConversationId: string | null
  commandPaletteOpen: boolean
  setUnread: (counts: Partial<Record<UnreadKind, number>>) => void
  incrementUnread: (kind: UnreadKind, by?: number) => void
  setActiveConversation: (id: string | null) => void
  setCommandPaletteOpen: (open: boolean) => void
  toggleCommandPalette: () => void
  reset: () => void
}

const initial = { unread: { messages: 0, notifications: 0 }, activeConversationId: null, commandPaletteOpen: false }

export const useUiStore = create<UiState>()((set) => ({
  ...initial,
  setUnread: (counts) => set((s) => ({ unread: { ...s.unread, ...counts } })),
  incrementUnread: (kind, by = 1) => set((s) => ({ unread: { ...s.unread, [kind]: Math.max(0, s.unread[kind] + by) } })),
  setActiveConversation: (activeConversationId) => set({ activeConversationId }),
  setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
  toggleCommandPalette: () => set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),
  reset: () => set(initial),
}))

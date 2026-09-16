// React Query key factory. Invalidate by prefix, e.g. queryKeys.notifications.all.
export const queryKeys = {
  me: ["me"] as const,
  notifications: {
    all: ["notifications"] as const,
    list: (filters?: { unread?: boolean }) => ["notifications", "list", filters ?? {}] as const,
    unreadCount: ["notifications", "unread-count"] as const,
  },
  conversations: {
    all: ["conversations"] as const,
    list: () => ["conversations", "list"] as const,
    detail: (id: string) => ["conversations", "detail", id] as const,
    messages: (id: string) => ["conversations", "messages", id] as const,
    unreadCount: ["conversations", "unread-count"] as const,
  },
  deals: {
    all: ["deals"] as const,
    list: (filters?: object) => ["deals", "list", filters ?? {}] as const,
    detail: (id: string) => ["deals", "detail", id] as const,
  },
  briefs: {
    all: ["briefs"] as const,
    open: (filters?: object) => ["briefs", "open", filters ?? {}] as const,
    mine: (filters?: object) => ["briefs", "mine", filters ?? {}] as const,
    detail: (id: string) => ["briefs", "detail", id] as const,
  },
  applications: { all: ["applications"] as const },
  payments: { all: ["payments"] as const },
  analytics: { all: ["analytics"] as const },
  social: { all: ["social"] as const },
} as const

// Binds every domain module to a transport. Isomorphic: used by the server
// client (gateway + session token) and the browser client (BFF proxy).
import type { Requester } from "./core"
import { adminApi } from "./admin"
import { analyticsApi } from "./analytics"
import { applicationsApi } from "./applications"
import { authApi } from "./auth"
import { brandsApi } from "./brands"
import { briefsApi } from "./briefs"
import { creatorsApi } from "./creators"
import { dealsApi } from "./deals"
import { mediaApi } from "./media"
import { messagesApi } from "./messages"
import { notificationsApi } from "./notifications"
import { offersApi } from "./offers"
import { paymentsApi } from "./payments"
import { searchApi } from "./search"
import { socialApi } from "./social"
import { usersApi } from "./users"

export function createApi(r: Requester) {
  return {
    auth: authApi(r),
    users: usersApi(r),
    creators: creatorsApi(r),
    brands: brandsApi(r),
    briefs: briefsApi(r),
    applications: applicationsApi(r),
    deals: dealsApi(r),
    offers: offersApi(r),
    payments: paymentsApi(r),
    messages: messagesApi(r),
    notifications: notificationsApi(r),
    search: searchApi(r),
    analytics: analyticsApi(r),
    media: mediaApi(r),
    social: socialApi(r),
    admin: adminApi(r),
  }
}

export type Api = ReturnType<typeof createApi>

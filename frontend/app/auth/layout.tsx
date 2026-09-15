import { AuthShell } from "@/components/marketing/auth/auth-shell"

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <AuthShell>{children}</AuthShell>
}

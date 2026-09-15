import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = { title: "Reset your password" }

export default function ForgotPasswordPage() {
  return (
    <div>
      <span className="grid size-12 place-items-center rounded-2xl bg-accent text-accent-foreground">
        <Mail className="size-5" />
      </span>
      <h1 className="mt-6 font-display text-3xl font-bold tracking-tight">Reset your password</h1>
      <p className="mt-3 text-muted-foreground">
        Self-serve email reset is coming soon. Until then, email{" "}
        <a href="mailto:support@hustl.app" className="font-medium text-primary hover:underline">
          support@hustl.app
        </a>{" "}
        from the address on your account and we’ll help you get back in.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button asChild className="h-11">
          <a href="mailto:support@hustl.app?subject=Password%20reset">Email support</a>
        </Button>
        <Button asChild variant="outline" className="h-11">
          <Link href="/auth/signin">
            <ArrowLeft /> Back to log in
          </Link>
        </Button>
      </div>
    </div>
  )
}

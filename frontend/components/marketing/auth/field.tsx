"use client"

import { forwardRef, useState } from "react"
import { Eye, EyeOff } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p id={id} role="alert" className="text-xs font-medium text-destructive">
      {message}
    </p>
  )
}

export function FormAlert({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-destructive">
      {message}
    </p>
  )
}

type FieldProps = React.ComponentProps<"input"> & { label: React.ReactNode; error?: string; hint?: React.ReactNode; prefix?: string; labelAside?: React.ReactNode }

export const TextField = forwardRef<HTMLInputElement, FieldProps>(function TextField({ id, label, error, hint, prefix, labelAside, className, ...props }, ref) {
  const inputId = id ?? props.name!
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor={inputId}>{label}</Label>
        {labelAside}
      </div>
      <div className="relative">
        {prefix && <span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-sm text-muted-foreground">{prefix}</span>}
        <Input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className={cn("h-11", prefix && "pl-7", className)}
          {...props}
        />
      </div>
      {error ? <FieldError id={`${inputId}-error`} message={error} /> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
})

export const PasswordField = forwardRef<HTMLInputElement, Omit<FieldProps, "type" | "prefix">>(function PasswordField({ id, label, error, hint, labelAside, ...props }, ref) {
  const [show, setShow] = useState(false)
  const inputId = id ?? props.name!
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor={inputId}>{label}</Label>
        {labelAside}
      </div>
      <div className="relative">
        <Input
          ref={ref}
          id={inputId}
          type={show ? "text" : "password"}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className="h-11 pr-10"
          {...props}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted-foreground hover:text-foreground"
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      {error ? <FieldError id={`${inputId}-error`} message={error} /> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
})

import { Dumbbell, Gamepad2, Landmark, Laptop, Plane, ShoppingBag, Sparkles, Utensils, Shirt, Baby, Car, Music } from "lucide-react"
import { Container } from "@/components/marketing/section"

const CATEGORIES = [
  { label: "Beauty & skincare", icon: Sparkles },
  { label: "D2C brands", icon: ShoppingBag },
  { label: "Fintech", icon: Landmark },
  { label: "Gaming", icon: Gamepad2 },
  { label: "Food & beverage", icon: Utensils },
  { label: "Fashion", icon: Shirt },
  { label: "Consumer tech", icon: Laptop },
  { label: "Fitness", icon: Dumbbell },
  { label: "Travel", icon: Plane },
  { label: "Parenting", icon: Baby },
  { label: "Auto", icon: Car },
  { label: "Music", icon: Music },
]

export function CategoryMarquee() {
  const row = [...CATEGORIES, ...CATEGORIES]
  return (
    <section aria-label="Categories on hustl." className="border-y bg-muted/30 py-8">
      <Container>
        <p className="text-center text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Built for campaigns across every category
        </p>
      </Container>
      <div className="relative mt-6 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
        <ul className="flex w-max animate-marquee gap-3 hover:[animation-play-state:paused]">
          {row.map((c, i) => (
            <li
              key={`${c.label}-${i}`}
              aria-hidden={i >= CATEGORIES.length}
              className="flex shrink-0 items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm font-medium text-muted-foreground"
            >
              <c.icon className="size-4 text-primary" />
              {c.label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

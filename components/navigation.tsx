"use client"

import { Button } from "@/components/ui/button"
import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuLink,
} from "@/components/ui/navigation-menu"
import { useState, useEffect } from "react"
import { useTheme } from "next-themes"
import { Moon, Sun } from "lucide-react"
import Link from "next/link"
import { Logo } from "@/components/logo"

export function Navigation() {
  const [isScrolled, setIsScrolled] = useState(false)
  const [mounted, setMounted] = useState(false)
  const { theme, setTheme, resolvedTheme } = useTheme()

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20)
    }
    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId)
    if (element) {
      element.scrollIntoView({ behavior: "smooth" })
    }
  }

  const toggleTheme = () => {
    if (resolvedTheme === "dark") {
      setTheme("light")
    } else {
      setTheme("dark")
    }
  }

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? "bg-background/95 backdrop-blur-md border-b border-border shadow-sm"
          : "bg-background/80 backdrop-blur-sm"
      }`}
    >
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <Link 
              href="/" 
              className="flex items-center gap-2 cursor-pointer transition-transform hover:scale-105"
            >
              <Logo size="md" animated />
              <span className="text-xl font-bold text-primary">Hustl</span>
            </Link>
          </div>

          <NavigationMenu className="hidden md:flex">
            <NavigationMenuList className="gap-1">
              <NavigationMenuItem>
                <NavigationMenuLink
                  className="cursor-pointer px-4 py-2 text-sm font-medium text-foreground/80 hover:text-foreground transition-colors rounded-md hover:bg-accent/50 font-semibold"
                  onClick={() => scrollToSection("how-it-works")}
                >
                  How It Works
                </NavigationMenuLink>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <NavigationMenuLink
                  className="cursor-pointer px-4 py-2 text-sm font-medium text-foreground/80 hover:text-foreground transition-colors rounded-md hover:bg-accent/50 font-semibold"
                  onClick={() => scrollToSection("why-hustle")}
                >
                  Why Hustl
                </NavigationMenuLink>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <NavigationMenuLink
                  className="cursor-pointer px-4 py-2 text-sm font-medium text-foreground/80 hover:text-foreground transition-colors rounded-md hover:bg-accent/50 font-semibold"
                  onClick={() => scrollToSection("benefits")}
                >
                  Benefits
                </NavigationMenuLink>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>

          <div className="flex items-center gap-3">
            {mounted && (
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleTheme}
                className="text-foreground/70 hover:text-foreground transition-colors"
                aria-label="Toggle theme"
              >
                {resolvedTheme === "dark" ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="text-foreground/80 hover:text-foreground transition-colors font-medium"
              asChild
            >
              <Link href="/auth/signin">Login</Link>
            </Button>
            <Button size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium" asChild>
              <Link href="/auth/signup">Sign Up</Link>
            </Button>
          </div>
        </div>
      </div>
    </nav>
  )
}

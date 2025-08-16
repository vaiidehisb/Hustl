"use client"

import { Button } from "@/components/ui/button"
import { ArrowRight, Sparkles } from "lucide-react"
import { useEffect, useRef, useState } from "react"

export function CTASection() {
  const [isVisible, setIsVisible] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
        }
      },
      { threshold: 0.3 },
    )

    if (sectionRef.current) {
      observer.observe(sectionRef.current)
    }

    return () => observer.disconnect()
  }, [])

  return (
    <section
      ref={sectionRef}
      className="py-24 bg-gradient-to-br from-primary/5 via-secondary/5 to-primary/5 relative overflow-hidden"
    >
      {/* Background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-20 left-20 w-32 h-32 bg-secondary/10 rounded-full animate-float" />
        <div
          className="absolute bottom-20 right-20 w-40 h-40 bg-primary/10 rounded-full animate-float"
          style={{ animationDelay: "2s" }}
        />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-60 h-60 bg-accent/5 rounded-full animate-float"
          style={{ animationDelay: "4s" }}
        />
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <div className={`text-center transition-all duration-1000 ${isVisible ? "animate-slide-in-up" : "opacity-0"}`}>
          <div className="flex justify-center mb-6">
            <div className="flex items-center gap-2 bg-secondary/10 px-4 py-2 rounded-full">
              <Sparkles className="w-5 h-5 text-secondary" />
              <span className="text-sm font-medium text-secondary">Ready to Transform Your Work?</span>
            </div>
          </div>

          <h2 className="text-4xl md:text-6xl font-sans font-bold text-foreground mb-6 leading-tight">
            Stop Worrying,
            <br />
            <span className="text-secondary">Start Working.</span>
          </h2>

          <p className="text-xl md:text-2xl text-muted-foreground font-serif mb-12 max-w-3xl mx-auto leading-relaxed">
            Join thousands of founders and freelancers who've discovered the future of secure, transparent work
            relationships.
          </p>

          <div className="flex flex-col sm:flex-row gap-6 justify-center items-center">
            <Button
              size="lg"
              className="bg-primary hover:bg-primary/90 text-primary-foreground px-10 py-6 text-xl font-semibold group transition-all duration-300 hover:scale-105 animate-pulse-glow"
            >
              Sign Up as a Founder
              <ArrowRight className="ml-3 w-6 h-6 group-hover:translate-x-1 transition-transform" />
            </Button>

            <Button
              size="lg"
              className="bg-secondary hover:bg-secondary/90 text-secondary-foreground px-10 py-6 text-xl font-semibold group transition-all duration-300 hover:scale-105"
            >
              Sign Up as a Freelancer
              <ArrowRight className="ml-3 w-6 h-6 group-hover:translate-x-1 transition-transform" />
            </Button>
          </div>

          <div className="mt-8">
            <p className="text-sm text-muted-foreground font-serif">
              Free to join • No setup fees • Start earning in minutes
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

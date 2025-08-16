"use client"

import { Card } from "@/components/ui/card"
import { Shield, Settings, Clock, AlertTriangle } from "lucide-react"
import { useEffect, useRef, useState } from "react"

export function WhyHustleSection() {
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

  const problems = [
    {
      icon: Clock,
      title: "Payment delays",
      description: "Waiting weeks or months for payment",
      color: "text-red-500",
    },
    {
      icon: AlertTriangle,
      title: "Uncertainty",
      description: "Never knowing if you'll get paid",
      color: "text-orange-500",
    },
  ]

  const solutions = [
    {
      icon: Shield,
      title: "Security",
      description: "Blockchain-secured smart contracts",
      color: "text-secondary",
    },
    {
      icon: Settings,
      title: "Clarity",
      description: "Transparent, automated processes",
      color: "text-secondary",
    },
  ]

  return (
    <section ref={sectionRef} id="why-hustle" className="py-24 bg-card/30">
      <div className="container mx-auto px-4">
        <div
          className={`text-center mb-16 transition-all duration-1000 ${isVisible ? "animate-slide-in-up" : "opacity-0"}`}
        >
          <h2 className="text-4xl md:text-5xl font-sans font-bold text-foreground mb-6">Why Hustl?</h2>
          <p className="text-xl text-muted-foreground font-serif max-w-3xl mx-auto">
            Traditional freelancing platforms leave both founders and freelancers vulnerable. We've built a better way.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-12 max-w-6xl mx-auto">
          {/* Problems */}
          <div className={`transition-all duration-1000 delay-300 ${isVisible ? "animate-slide-in-up" : "opacity-0"}`}>
            <h3 className="text-2xl font-sans font-semibold text-foreground mb-8 text-center">Traditional Problems</h3>
            <Card className="bg-gradient-to-br from-red-50 to-orange-50 border-red-200 p-8">
              <div className="grid gap-6">
                {problems.map((problem, index) => (
                  <div key={index} className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-sm">
                      <problem.icon className={`w-6 h-6 ${problem.color}`} />
                    </div>
                    <div>
                      <h4 className="font-semibold text-foreground text-lg">{problem.title}</h4>
                      <p className="text-muted-foreground">{problem.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Solutions */}
          <div className={`transition-all duration-1000 delay-500 ${isVisible ? "animate-slide-in-up" : "opacity-0"}`}>
            <h3 className="text-2xl font-sans font-semibold text-foreground mb-8 text-center">Hustl Solutions</h3>
            <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-secondary/30 p-8">
              <div className="grid gap-6">
                {solutions.map((solution, index) => (
                  <div key={index} className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-secondary/10 flex items-center justify-center shadow-sm">
                      <solution.icon className={`w-6 h-6 ${solution.color}`} />
                    </div>
                    <div>
                      <h4 className="font-semibold text-foreground text-lg">{solution.title}</h4>
                      <p className="text-muted-foreground">{solution.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </section>
  )
}

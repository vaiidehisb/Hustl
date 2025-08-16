"use client"

import { Card } from "@/components/ui/card"
import { Brain, Lock, CheckCircle, ArrowRight } from "lucide-react"
import { useEffect, useRef, useState } from "react"

export function HowItWorksSection() {
  const [isVisible, setIsVisible] = useState(false)
  const [activeStep, setActiveStep] = useState(0)
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

  useEffect(() => {
    if (isVisible) {
      const interval = setInterval(() => {
        setActiveStep((prev) => (prev + 1) % 4)
      }, 3000)
      return () => clearInterval(interval)
    }
  }, [isVisible])

  const steps = [
    {
      number: "1",
      title: "AI Smart Match",
      description: "Founder posts job. AI instantly matches with top talent",
      icon: Brain,
      details:
        "Our advanced AI analyzes project requirements, skills, and past performance to connect you with the perfect match in seconds.",
    },
    {
      number: "2",
      title: "Smart Contract Escrow",
      description: "Founder funds the project into a secure blockchain smart contract",
      icon: Lock,
      details:
        "Funds are securely held in an immutable smart contract, ensuring both parties are protected throughout the project.",
    },
    {
      number: "3",
      title: "Work & Verify",
      description: "Freelancer completes work. Founder approves",
      icon: CheckCircle,
      details: "Transparent milestone tracking and approval process with built-in dispute resolution mechanisms.",
    },
    {
      number: "4",
      title: "Auto-Release Payment",
      description: "Funds are automatically released to the freelancer",
      icon: ArrowRight,
      details: "Upon approval, smart contracts instantly release payment - no delays, no disputes, no hassle.",
    },
  ]

  return (
    <section ref={sectionRef} id="how-it-works" className="py-24 bg-background">
      <div className="container mx-auto px-4">
        <div
          className={`text-center mb-16 transition-all duration-1000 ${isVisible ? "animate-slide-in-up" : "opacity-0"}`}
        >
          <h2 className="text-4xl md:text-5xl font-sans font-bold text-foreground mb-6">How It Works</h2>
          <p className="text-xl text-muted-foreground font-serif max-w-3xl mx-auto">
            Our revolutionary process combines AI matching with blockchain security for seamless, trustworthy
            transactions.
          </p>
        </div>

        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((step, index) => (
              <div
                key={index}
                className={`transition-all duration-1000 ${isVisible ? "animate-slide-in-up" : "opacity-0"}`}
                style={{ animationDelay: `${index * 200}ms` }}
              >
                <Card
                  className={`p-6 h-full transition-all duration-500 hover:scale-105 cursor-pointer ${
                    activeStep === index ? "bg-secondary/10 border-secondary shadow-lg" : "hover:shadow-md"
                  }`}
                  onClick={() => setActiveStep(index)}
                >
                  <div className="text-center">
                    <div
                      className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center transition-all duration-300 ${
                        activeStep === index
                          ? "bg-secondary text-secondary-foreground animate-pulse-glow"
                          : "bg-card border-2 border-border"
                      }`}
                    >
                      <step.icon className="w-8 h-8" />
                    </div>

                    <div
                      className={`text-sm font-bold mb-2 transition-colors duration-300 ${
                        activeStep === index ? "text-secondary" : "text-muted-foreground"
                      }`}
                    >
                      {step.number}
                    </div>

                    <h3 className="text-lg font-sans font-semibold text-foreground mb-3">{step.title}</h3>

                    <p className="text-sm text-muted-foreground font-serif leading-relaxed mb-4">{step.description}</p>

                    {activeStep === index && (
                      <div className="animate-fade-in">
                        <p className="text-xs text-muted-foreground font-serif leading-relaxed">{step.details}</p>
                      </div>
                    )}
                  </div>
                </Card>
              </div>
            ))}
          </div>

          {/* Progress indicator */}
          <div className="flex justify-center mt-12">
            <div className="flex gap-2">
              {steps.map((_, index) => (
                <div
                  key={index}
                  className={`w-3 h-3 rounded-full transition-all duration-300 ${
                    activeStep === index ? "bg-secondary" : "bg-border"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

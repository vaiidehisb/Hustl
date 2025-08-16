"use client"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Bot, MessageCircle, Clock, Shield, HelpCircle } from "lucide-react"
import { useEffect, useRef, useState } from "react"

export function HustleBotSection() {
  const [isVisible, setIsVisible] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          setTimeout(() => setIsTyping(true), 1000)
        }
      },
      { threshold: 0.3 },
    )

    if (sectionRef.current) {
      observer.observe(sectionRef.current)
    }

    return () => observer.disconnect()
  }, [])

  const features = [
    {
      icon: MessageCircle,
      title: "Instant Answers",
      description: "Get immediate responses to your questions about projects, payments, and platform features",
    },
    {
      icon: HelpCircle,
      title: "Onboarding Guide",
      description: "Step-by-step assistance to help you navigate the platform and get started quickly",
    },
    {
      icon: Shield,
      title: "Smart Contract Clarity",
      description: "Understand your agreements with plain-English explanations of blockchain terms",
    },
    {
      icon: Clock,
      title: "24/7 Availability",
      description: "Round-the-clock support whenever you need help, no matter your timezone",
    },
  ]

  return (
    <section ref={sectionRef} className="py-24 bg-background">
      <div className="container mx-auto px-4">
        <div
          className={`text-center mb-16 transition-all duration-1000 ${isVisible ? "animate-slide-in-up" : "opacity-0"}`}
        >
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 rounded-full bg-secondary/10 flex items-center justify-center animate-pulse-glow">
              <Bot className="w-10 h-10 text-secondary" />
            </div>
          </div>
          <h2 className="text-4xl md:text-5xl font-sans font-bold text-foreground mb-6">
            Your 24/7 AI Assistant: HustleBot
          </h2>
          <p className="text-xl text-muted-foreground font-serif max-w-3xl mx-auto">
            Meet your intelligent companion that enhances the "clarity stack" with instant support and guidance.
          </p>
        </div>

        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Chat Demo */}
            <div
              className={`transition-all duration-1000 delay-300 ${isVisible ? "animate-slide-in-up" : "opacity-0"}`}
            >
              <Card className="p-6 bg-card/50 backdrop-blur-sm">
                <div className="space-y-4">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-8 h-8 rounded-full bg-secondary/20 flex items-center justify-center">
                      <Bot className="w-4 h-4 text-secondary" />
                    </div>
                    <span className="font-semibold text-foreground">HustleBot</span>
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  </div>

                  <div className="space-y-3">
                    <div className="bg-secondary/10 rounded-lg p-3 max-w-xs">
                      <p className="text-sm text-foreground">
                        Hi! I'm here to help you navigate Hustl. What would you like to know?
                      </p>
                    </div>

                    <div className="bg-primary/10 rounded-lg p-3 max-w-xs ml-auto">
                      <p className="text-sm text-foreground">How do smart contracts protect my payments?</p>
                    </div>

                    {isTyping && (
                      <div className="bg-secondary/10 rounded-lg p-3 max-w-xs animate-fade-in">
                        <p className="text-sm text-foreground">
                          Smart contracts are like digital safes that automatically release your payment when project
                          milestones are approved. The funds are held securely on the blockchain, so neither party can
                          access them until the agreed conditions are met. This eliminates payment delays and disputes!
                          🔒
                        </p>
                      </div>
                    )}

                    {isTyping && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground animate-fade-in">
                        <div className="flex gap-1">
                          <div className="w-1 h-1 bg-secondary rounded-full animate-bounce" />
                          <div
                            className="w-1 h-1 bg-secondary rounded-full animate-bounce"
                            style={{ animationDelay: "0.1s" }}
                          />
                          <div
                            className="w-1 h-1 bg-secondary rounded-full animate-bounce"
                            style={{ animationDelay: "0.2s" }}
                          />
                        </div>
                        <span>HustleBot is typing...</span>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </div>

            {/* Features */}
            <div
              className={`transition-all duration-1000 delay-500 ${isVisible ? "animate-slide-in-up" : "opacity-0"}`}
            >
              <div className="space-y-6">
                {features.map((feature, index) => (
                  <div key={index} className="flex items-start gap-4 group">
                    <div className="w-12 h-12 rounded-full bg-secondary/10 flex items-center justify-center group-hover:bg-secondary/20 transition-colors duration-300">
                      <feature.icon className="w-6 h-6 text-secondary" />
                    </div>
                    <div>
                      <h3 className="text-lg font-sans font-semibold text-foreground mb-2">{feature.title}</h3>
                      <p className="text-muted-foreground font-serif leading-relaxed">{feature.description}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-8">
                <Button
                  size="lg"
                  variant="outline"
                  className="border-secondary text-secondary hover:bg-secondary hover:text-secondary-foreground bg-transparent"
                >
                  Chat with HustleBot
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

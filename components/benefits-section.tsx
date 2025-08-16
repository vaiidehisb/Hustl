"use client"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Target, Brain, Zap, UserCheck, CreditCard, FileText, Briefcase, Scale } from "lucide-react"
import { useEffect, useRef, useState } from "react"

export function BenefitsSection() {
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

  const founderBenefits = [
    {
      icon: Target,
      title: "Guaranteed Project Delivery",
      description: "Smart contracts ensure milestones are met before payments are released",
    },
    {
      icon: Brain,
      title: "AI-Powered Talent Match",
      description: "Find the perfect freelancer for your project in seconds, not days",
    },
    {
      icon: Zap,
      title: "Streamlined Hiring",
      description: "Skip the lengthy vetting process with pre-verified professionals",
    },
    {
      icon: UserCheck,
      title: "Verified Professionals",
      description: "All freelancers are blockchain-verified with proven track records",
    },
  ]

  const freelancerBenefits = [
    {
      icon: CreditCard,
      title: "Secure & Guaranteed Payments",
      description: "Get paid automatically when milestones are approved - no chasing clients",
    },
    {
      icon: FileText,
      title: "Transparent Agreements",
      description: "Smart contracts make all terms crystal clear and immutable",
    },
    {
      icon: Briefcase,
      title: "Relevant Opportunities",
      description: "AI matches you with projects that fit your skills and interests perfectly",
    },
    {
      icon: Scale,
      title: "Fair Dispute Resolution",
      description: "Blockchain-based arbitration ensures fair outcomes for all parties",
    },
  ]

  return (
    <section ref={sectionRef} id="benefits" className="py-24 bg-card/30">
      <div className="container mx-auto px-4">
        <div
          className={`text-center mb-16 transition-all duration-1000 ${isVisible ? "animate-slide-in-up" : "opacity-0"}`}
        >
          <h2 className="text-4xl md:text-5xl font-sans font-bold text-foreground mb-6">What You Gain</h2>
          <p className="text-xl text-muted-foreground font-serif max-w-3xl mx-auto">
            Discover the specific advantages Hustl brings to founders and freelancers alike.
          </p>
        </div>

        <div
          className={`max-w-6xl mx-auto transition-all duration-1000 delay-300 ${isVisible ? "animate-slide-in-up" : "opacity-0"}`}
        >
          <Tabs defaultValue="founders" className="w-full">
            <TabsList className="grid w-full grid-cols-2 max-w-md mx-auto mb-12">
              <TabsTrigger value="founders" className="text-lg font-semibold">
                For Founders
              </TabsTrigger>
              <TabsTrigger value="freelancers" className="text-lg font-semibold">
                For Freelancers
              </TabsTrigger>
            </TabsList>

            <TabsContent value="founders" className="space-y-8">
              <div className="grid md:grid-cols-2 gap-8">
                {founderBenefits.map((benefit, index) => (
                  <Card key={index} className="p-6 hover:shadow-lg transition-all duration-300 hover:scale-105 group">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-full bg-secondary/10 flex items-center justify-center group-hover:bg-secondary/20 transition-colors duration-300">
                        <benefit.icon className="w-6 h-6 text-secondary" />
                      </div>
                      <div>
                        <h3 className="text-lg font-sans font-semibold text-foreground mb-2">{benefit.title}</h3>
                        <p className="text-muted-foreground font-serif leading-relaxed">{benefit.description}</p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
              <div className="text-center">
                <Button size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-4">
                  Start Hiring Today
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="freelancers" className="space-y-8">
              <div className="grid md:grid-cols-2 gap-8">
                {freelancerBenefits.map((benefit, index) => (
                  <Card key={index} className="p-6 hover:shadow-lg transition-all duration-300 hover:scale-105 group">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-full bg-secondary/10 flex items-center justify-center group-hover:bg-secondary/20 transition-colors duration-300">
                        <benefit.icon className="w-6 h-6 text-secondary" />
                      </div>
                      <div>
                        <h3 className="text-lg font-sans font-semibold text-foreground mb-2">{benefit.title}</h3>
                        <p className="text-muted-foreground font-serif leading-relaxed">{benefit.description}</p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
              <div className="text-center">
                <Button size="lg" className="bg-secondary hover:bg-secondary/90 text-secondary-foreground px-8 py-4">
                  Find Projects Now
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </section>
  )
}

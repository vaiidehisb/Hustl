"use client"

import { Card } from "@/components/ui/card"
import { Star, ChevronLeft, ChevronRight } from "lucide-react"
import { useEffect, useRef, useState } from "react"

export function TestimonialsSection() {
  const [isVisible, setIsVisible] = useState(false)
  const [currentTestimonial, setCurrentTestimonial] = useState(0)
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
        setCurrentTestimonial((prev) => (prev + 1) % testimonials.length)
      }, 5000)
      return () => clearInterval(interval)
    }
  }, [isVisible])

  const testimonials = [
    {
      name: "Sarah Chen",
      role: "Startup Founder",
      company: "TechFlow",
      image: "/professional-woman-dark-hair.png",
      quote:
        "Hustl transformed how we hire freelancers. The AI matching is incredibly accurate, and knowing payments are secured by smart contracts gives us complete peace of mind.",
      rating: 5,
    },
    {
      name: "Marcus Rodriguez",
      role: "Full-Stack Developer",
      company: "Freelancer",
      image: "/professional-bearded-man.png",
      quote:
        "Finally, a platform where I don't have to chase clients for payment! The automatic release system means I get paid the moment my work is approved. Game changer.",
      rating: 5,
    },
    {
      name: "Emily Watson",
      role: "Product Manager",
      company: "InnovateCorp",
      image: "/professional-blonde-woman.png",
      quote:
        "The transparency of smart contracts eliminated all the usual freelancing headaches. Both sides know exactly what to expect, and HustleBot makes everything crystal clear.",
      rating: 5,
    },
    {
      name: "David Kim",
      role: "UI/UX Designer",
      company: "Freelancer",
      image: "/professional-asian-man.png",
      quote:
        "I've tried every freelancing platform out there. Hustl's AI actually understands my skills and matches me with projects I'm passionate about. Plus, guaranteed payments!",
      rating: 5,
    },
  ]

  const nextTestimonial = () => {
    setCurrentTestimonial((prev) => (prev + 1) % testimonials.length)
  }

  const prevTestimonial = () => {
    setCurrentTestimonial((prev) => (prev - 1 + testimonials.length) % testimonials.length)
  }

  return (
    <section ref={sectionRef} id="testimonials" className="py-24 bg-card/30">
      <div className="container mx-auto px-4">
        <div
          className={`text-center mb-16 transition-all duration-1000 ${isVisible ? "animate-slide-in-up" : "opacity-0"}`}
        >
          <h2 className="text-4xl md:text-5xl font-sans font-bold text-foreground mb-6">Hear from Our Users</h2>
          <p className="text-xl text-muted-foreground font-serif max-w-3xl mx-auto">
            Discover how Hustl is transforming the freelancing experience for founders and freelancers worldwide.
          </p>
        </div>

        <div
          className={`max-w-4xl mx-auto transition-all duration-1000 delay-300 ${isVisible ? "animate-slide-in-up" : "opacity-0"}`}
        >
          <div className="relative">
            <Card className="p-8 md:p-12 text-center">
              <div className="flex justify-center mb-6">
                <img
                  src={testimonials[currentTestimonial].image || "/placeholder.svg"}
                  alt={testimonials[currentTestimonial].name}
                  className="w-20 h-20 rounded-full object-cover border-4 border-secondary/20"
                />
              </div>

              <div className="flex justify-center mb-6">
                {[...Array(testimonials[currentTestimonial].rating)].map((_, i) => (
                  <Star key={i} className="w-5 h-5 text-yellow-400 fill-current" />
                ))}
              </div>

              <blockquote className="text-xl md:text-2xl text-foreground font-serif leading-relaxed mb-8 italic">
                "{testimonials[currentTestimonial].quote}"
              </blockquote>

              <div>
                <div className="font-sans font-semibold text-foreground text-lg">
                  {testimonials[currentTestimonial].name}
                </div>
                <div className="text-muted-foreground">
                  {testimonials[currentTestimonial].role} • {testimonials[currentTestimonial].company}
                </div>
              </div>
            </Card>

            {/* Navigation buttons */}
            <button
              onClick={prevTestimonial}
              className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-background border border-border hover:bg-card transition-colors duration-300 flex items-center justify-center"
            >
              <ChevronLeft className="w-6 h-6 text-foreground" />
            </button>

            <button
              onClick={nextTestimonial}
              className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-background border border-border hover:bg-card transition-colors duration-300 flex items-center justify-center"
            >
              <ChevronRight className="w-6 h-6 text-foreground" />
            </button>
          </div>

          {/* Dots indicator */}
          <div className="flex justify-center mt-8 gap-2">
            {testimonials.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentTestimonial(index)}
                className={`w-3 h-3 rounded-full transition-all duration-300 ${
                  currentTestimonial === index ? "bg-secondary" : "bg-border hover:bg-muted"
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

import { HeroSection } from "@/components/hero-section"
import { WhyHustleSection } from "@/components/why-hustle-section"
import { HowItWorksSection } from "@/components/how-it-works-section"
import { BenefitsSection } from "@/components/benefits-section"
import { HustleBotSection } from "@/components/hustlebot-section"
import { TestimonialsSection } from "@/components/testimonials-section"
import { CTASection } from "@/components/cta-section"
import { Footer } from "@/components/footer"

export default function Home() {
  return (
    <main className="min-h-screen">
      <HeroSection />
      <WhyHustleSection />
      <HowItWorksSection />
      <BenefitsSection />
      <HustleBotSection />
      <TestimonialsSection />
      <CTASection />
      <Footer />
    </main>
  )
}

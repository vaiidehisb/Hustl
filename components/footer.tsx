import { Button } from "@/components/ui/button"
import { Github, Twitter, Linkedin, Mail } from "lucide-react"

export function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="bg-card border-t border-border">
      <div className="container mx-auto px-4 py-16">
        <div className="grid md:grid-cols-4 gap-8">
          {/* Logo and description */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-3 mb-4">
              <img
                src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Screenshot%202025-08-16%20at%208.11.15%E2%80%AFPM-b02tGkc8BjxpGCFsNiPBaMTTogLEVo.png"
                alt="Hustl Logo"
                className="h-8 w-auto"
              />
            </div>
            <p className="text-muted-foreground font-serif leading-relaxed mb-6 max-w-md">
              The decentralised marketplace connecting founders and freelancers with guaranteed payments via smart
              contracts and AI matching.
            </p>
            <div className="flex gap-4">
              <Button variant="ghost" size="sm" className="p-2">
                <Twitter className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="sm" className="p-2">
                <Linkedin className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="sm" className="p-2">
                <Github className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="sm" className="p-2">
                <Mail className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Platform links */}
          <div>
            <h3 className="font-sans font-semibold text-foreground mb-4">Platform</h3>
            <ul className="space-y-3">
              <li>
                <a href="#" className="text-muted-foreground hover:text-secondary transition-colors duration-300">
                  How It Works
                </a>
              </li>
              <li>
                <a href="#" className="text-muted-foreground hover:text-secondary transition-colors duration-300">
                  For Founders
                </a>
              </li>
              <li>
                <a href="#" className="text-muted-foreground hover:text-secondary transition-colors duration-300">
                  For Freelancers
                </a>
              </li>
              <li>
                <a href="#" className="text-muted-foreground hover:text-secondary transition-colors duration-300">
                  Smart Contracts
                </a>
              </li>
              <li>
                <a href="#" className="text-muted-foreground hover:text-secondary transition-colors duration-300">
                  AI Matching
                </a>
              </li>
            </ul>
          </div>

          {/* Support links */}
          <div>
            <h3 className="font-sans font-semibold text-foreground mb-4">Support</h3>
            <ul className="space-y-3">
              <li>
                <a href="#" className="text-muted-foreground hover:text-secondary transition-colors duration-300">
                  Help Center
                </a>
              </li>
              <li>
                <a href="#" className="text-muted-foreground hover:text-secondary transition-colors duration-300">
                  Contact Us
                </a>
              </li>
              <li>
                <a href="#" className="text-muted-foreground hover:text-secondary transition-colors duration-300">
                  HustleBot
                </a>
              </li>
              <li>
                <a href="#" className="text-muted-foreground hover:text-secondary transition-colors duration-300">
                  Community
                </a>
              </li>
              <li>
                <a href="#" className="text-muted-foreground hover:text-secondary transition-colors duration-300">
                  Blog
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-border mt-12 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-sm text-muted-foreground">© {currentYear} Hustl. All rights reserved.</div>
          <div className="flex gap-6 text-sm">
            <a href="#" className="text-muted-foreground hover:text-secondary transition-colors duration-300">
              Privacy Policy
            </a>
            <a href="#" className="text-muted-foreground hover:text-secondary transition-colors duration-300">
              Terms of Service
            </a>
            <a href="#" className="text-muted-foreground hover:text-secondary transition-colors duration-300">
              Cookie Policy
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}

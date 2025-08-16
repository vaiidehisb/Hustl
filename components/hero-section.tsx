"use client"

import { Button } from "@/components/ui/button"
import { ArrowRight, Sparkles, Shield, Zap, Code, Globe, Lock, Users, TrendingUp, Award } from "lucide-react"
import { motion, useScroll, useTransform, useSpring, useInView } from "framer-motion"
import { useRef, useEffect } from "react"
import { Logo } from "@/components/logo"

export function HeroSection() {
  const containerRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"]
  })

  const y = useTransform(scrollYProgress, [0, 1], ["0%", "50%"])
  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0])
  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.8])

  const springY = useSpring(y, { stiffness: 100, damping: 30 })
  const springOpacity = useSpring(opacity, { stiffness: 100, damping: 30 })

  // Stats animation
  const statsRef = useRef<HTMLDivElement>(null)
  const isStatsInView = useInView(statsRef, { once: true })

  return (
    <motion.section 
      ref={containerRef}
      className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-br from-background via-card to-background pt-16"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1 }}
    >
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden">
        <motion.div 
          className="absolute top-20 left-20 w-32 h-32 bg-secondary/20 rounded-full"
          animate={{ 
            y: [-20, 20, -20],
            x: [-10, 10, -10],
            scale: [1, 1.1, 1]
          }}
          transition={{ 
            duration: 6,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
        <motion.div
          className="absolute top-40 right-32 w-24 h-24 bg-accent/30 rounded-full"
          animate={{ 
            y: [20, -20, 20],
            x: [10, -10, 10],
            rotate: [0, 180, 360]
          }}
          transition={{ 
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 2
          }}
        />
        <motion.div
          className="absolute bottom-32 left-1/4 w-40 h-40 bg-primary/10 rounded-full"
          animate={{ 
            y: [-30, 30, -30],
            scale: [1, 1.2, 1],
            rotate: [0, 90, 180]
          }}
          transition={{ 
            duration: 10,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 4
          }}
        />
        <motion.div
          className="absolute bottom-20 right-20 w-28 h-28 bg-secondary/25 rounded-full"
          animate={{ 
            y: [30, -30, 30],
            x: [-15, 15, -15],
            scale: [1, 0.8, 1]
          }}
          transition={{ 
            duration: 7,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 1
          }}
        />
      </div>

      {/* Floating Icons */}
      <motion.div
        className="absolute top-1/4 left-1/6 text-primary/20"
        animate={{ 
          y: [-10, 10, -10],
          rotate: [0, 5, -5, 0]
        }}
        transition={{ 
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut"
        }}
      >
        <Code className="w-16 h-16" />
      </motion.div>
      <motion.div
        className="absolute top-1/3 right-1/6 text-secondary/20"
        animate={{ 
          y: [10, -10, 10],
          rotate: [0, -5, 5, 0]
        }}
        transition={{ 
          duration: 5,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 1
        }}
      >
        <Globe className="w-12 h-12" />
      </motion.div>
      <motion.div
        className="absolute bottom-1/4 left-1/4 text-accent/20"
        animate={{ 
          y: [-15, 15, -15],
          scale: [1, 1.1, 1]
        }}
        transition={{ 
          duration: 6,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 2
        }}
      >
        <Lock className="w-14 h-14" />
      </motion.div>

      {/* Main Content */}
      <motion.div 
        className="container mx-auto px-4 text-center relative z-10"
        style={{ y: springY, opacity: springOpacity, scale }}
      >
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          {/* Logo */}
          <motion.div
            className="flex justify-center mb-8"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.3 }}
          >
            <Logo size="lg" animated />
          </motion.div>

          {/* Main headline */}
          <motion.h1 
            className="text-5xl md:text-7xl font-sans font-bold text-foreground mb-6 leading-tight"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
          >
            Build Trust, Get Paid.
            <br />
            <motion.span 
              className="text-primary"
              animate={{ 
                backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
              }}
              transition={{ 
                duration: 3,
                repeat: Infinity,
                ease: "linear"
              }}
              style={{
                background: "linear-gradient(90deg, var(--primary), var(--secondary), var(--primary))",
                backgroundSize: "200% 100%",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text"
              }}
            >
              Effortlessly.
            </motion.span>
          </motion.h1>

          {/* Sub-headline */}
          <motion.p 
            className="text-xl md:text-2xl text-foreground/70 font-serif mb-12 max-w-4xl mx-auto leading-relaxed"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
          >
            The decentralised marketplace connecting founders and freelancers with guaranteed payments via smart
            contracts and AI matching.
          </motion.p>

          {/* Feature highlights */}
          <motion.div 
            className="flex flex-wrap justify-center gap-6 mb-12"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.8 }}
          >
            {[
              { icon: Sparkles, text: "AI Matching", color: "text-primary" },
              { icon: Shield, text: "Smart Contracts", color: "text-primary" },
              { icon: Zap, text: "Instant Payments", color: "text-primary" }
            ].map((feature, index) => (
              <motion.div
                key={feature.text}
                className="flex items-center gap-2 bg-card/80 backdrop-blur-sm px-4 py-2 rounded-full border border-border shadow-sm"
                whileHover={{ 
                  scale: 1.05,
                  boxShadow: "0 10px 25px rgba(0,0,0,0.1)"
                }}
                whileTap={{ scale: 0.95 }}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ 
                  duration: 0.5, 
                  delay: 1 + index * 0.1 
                }}
              >
                <feature.icon className={`w-5 h-5 ${feature.color}`} />
                <span className="text-sm font-medium text-foreground">{feature.text}</span>
              </motion.div>
            ))}
          </motion.div>

          {/* CTA Buttons */}
          <motion.div 
            className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 1.2 }}
          >
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Button
                size="lg"
                className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-4 text-lg font-semibold group transition-all duration-300 shadow-lg"
              >
                Find Talent Now
                <motion.div
                  animate={{ x: [0, 5, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  <ArrowRight className="ml-2 w-5 h-5" />
                </motion.div>
              </Button>
            </motion.div>
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Button
                size="lg"
                variant="outline"
                className="border-secondary text-secondary hover:bg-secondary hover:text-secondary-foreground px-8 py-4 text-lg font-semibold transition-all duration-300 bg-transparent backdrop-blur-sm"
              >
                Find Projects Now
              </Button>
            </motion.div>
          </motion.div>

          {/* Stats Section */}
          <motion.div
            ref={statsRef}
            className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto"
            initial={{ opacity: 0, y: 50 }}
            animate={isStatsInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 50 }}
            transition={{ duration: 0.8 }}
          >
            {[
              { icon: Users, number: "10K+", label: "Active Users", color: "text-blue-500" },
              { icon: TrendingUp, number: "$2M+", label: "Total Payments", color: "text-green-500" },
              { icon: Award, number: "99%", label: "Success Rate", color: "text-purple-500" }
            ].map((stat, index) => (
              <motion.div
                key={stat.label}
                className="text-center p-6 bg-card/50 backdrop-blur-sm rounded-xl border border-border"
                whileHover={{ 
                  scale: 1.05,
                  boxShadow: "0 10px 25px rgba(0,0,0,0.1)"
                }}
                initial={{ opacity: 0, y: 20 }}
                animate={isStatsInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
                transition={{ 
                  duration: 0.5, 
                  delay: index * 0.2 
                }}
              >
                <motion.div
                  className={`text-3xl font-bold ${stat.color} mb-2`}
                  initial={{ scale: 0 }}
                  animate={isStatsInView ? { scale: 1 } : { scale: 0 }}
                  transition={{ 
                    duration: 0.5, 
                    delay: index * 0.2 + 0.3,
                    type: "spring",
                    stiffness: 200
                  }}
                >
                  {stat.number}
                </motion.div>
                <div className="text-foreground/70 font-medium">{stat.label}</div>
                <stat.icon className={`w-8 h-8 ${stat.color} mx-auto mt-3`} />
              </motion.div>
            ))}
          </motion.div>

          {/* Learn more link */}
          <motion.div 
            className="mt-12"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 1.5 }}
          >
            <motion.a
              href="#how-it-works"
              className="text-foreground/60 hover:text-primary transition-colors duration-300 text-sm font-medium underline underline-offset-4"
              whileHover={{ scale: 1.05 }}
            >
              Learn More About Smart Contracts
            </motion.a>
          </motion.div>
        </motion.div>
      </motion.div>

      {/* Scroll indicator */}
      <motion.div 
        className="absolute bottom-8 left-1/2 transform -translate-x-1/2 text-foreground/40"
        animate={{ y: [0, 10, 0] }}
        transition={{ 
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut"
        }}
      >
        <div className="w-6 h-10 border-2 border-current rounded-full flex justify-center">
          <motion.div 
            className="w-1 h-3 bg-current rounded-full mt-2"
            animate={{ y: [0, 12, 0] }}
            transition={{ 
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />
        </div>
      </motion.div>
    </motion.section>
  )
}

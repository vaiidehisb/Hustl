"use client"

import { useSession, signOut } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { User, LogOut, Settings, Briefcase, DollarSign } from "lucide-react"
import { motion } from "framer-motion"

export default function Dashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/signin")
    }
  }, [status, router])

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (!session) {
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-card to-background p-4">
      <div className="container mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Header */}
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-3xl font-bold">Welcome back, {session.user?.name || "User"}!</h1>
              <p className="text-muted-foreground">Here's what's happening with your account</p>
            </div>
            <Button
              variant="outline"
              onClick={() => signOut({ callbackUrl: "/" })}
              className="flex items-center gap-2"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </Button>
          </div>

          {/* User Info Card */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Account Information
              </CardTitle>
              <CardDescription>Your profile details and account settings</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Name</label>
                  <p className="text-lg">{session.user?.name || "Not provided"}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Email</label>
                  <p className="text-lg">{session.user?.email || "Not provided"}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-3">
                    <Briefcase className="h-8 w-8 text-primary" />
                    <div>
                      <p className="text-2xl font-bold">12</p>
                      <p className="text-sm text-muted-foreground">Active Projects</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-3">
                    <DollarSign className="h-8 w-8 text-green-500" />
                    <div>
                      <p className="text-2xl font-bold">$2,450</p>
                      <p className="text-sm text-muted-foreground">Total Earnings</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-3">
                    <Settings className="h-8 w-8 text-blue-500" />
                    <div>
                      <p className="text-2xl font-bold">98%</p>
                      <p className="text-sm text-muted-foreground">Success Rate</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Common tasks and shortcuts</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Button variant="outline" className="h-20 flex flex-col gap-2">
                  <Briefcase className="h-5 w-5" />
                  <span>Find Projects</span>
                </Button>
                <Button variant="outline" className="h-20 flex flex-col gap-2">
                  <User className="h-5 w-5" />
                  <span>Find Talent</span>
                </Button>
                <Button variant="outline" className="h-20 flex flex-col gap-2">
                  <DollarSign className="h-5 w-5" />
                  <span>View Payments</span>
                </Button>
                <Button variant="outline" className="h-20 flex flex-col gap-2">
                  <Settings className="h-5 w-5" />
                  <span>Settings</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  )
} 
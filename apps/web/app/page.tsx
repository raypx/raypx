"use client"

import { Button } from "@raypx/ui/components/button"
import { closeAllToasts, toast } from "@raypx/ui/components/toast"
import Link from "next/link"
import { useTheme } from "next-themes"
import { UserAvatar } from "./_components/user-avatar"

export default function Home() {
  const { resolvedTheme, setTheme } = useTheme()

  const onClick = () => {
    toast.success("Hello World")
    setTheme(resolvedTheme === "dark" ? "light" : "dark")
  }

  const onCleanAll = () => {
    closeAllToasts()
  }

  return (
    <div className="min-h-screen">
      <header className="flex justify-between items-center p-4 border-b">
        <h1 className="text-2xl font-bold">RayPX</h1>
        <UserAvatar />
      </header>
      <main className="p-4 space-y-4">
        <Button variant="outline" onClick={onClick}>
          Click me
        </Button>
        <Button onClick={onCleanAll}>Clean All</Button>
        <Button variant="outline">Get Started</Button>
        <Link href="/signup">
          <Button>Sign Up</Button>
        </Link>
        <Link href="/signin">
          <Button>Sign In</Button>
        </Link>
      </main>
    </div>
  )
}

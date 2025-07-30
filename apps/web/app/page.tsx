"use client"

import { Button } from "@raypx/ui/components/button"
import { closeAllToasts, toast } from "@raypx/ui/components/toast"
import Link from "next/link"
import { useTheme } from "next-themes"

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
    <div>
      <Button variant="outline" onClick={onClick}>
        Click me
      </Button>
      <Button onClick={onCleanAll}>Clean All</Button>
      <Button variant="outline">Get Started</Button>
      <Link href="/sign-up">
        <Button>Sign Up</Button>
      </Link>
      <Link href="/sign-in">
        <Button>Sign In</Button>
      </Link>
    </div>
  )
}

"use client"

import { Button } from "@raypx/ui/components/button"
import { toast } from "@raypx/ui/components/sonner"
import { useTheme } from "next-themes"

export default function Home() {
  const { theme, setTheme } = useTheme()

  const onClick = () => {
    toast.success("Hello World")
    setTheme(theme === "dark" ? "light" : "dark")
  }
  return (
    <div>
      <Button onClick={onClick}>Click me</Button>
    </div>
  )
}

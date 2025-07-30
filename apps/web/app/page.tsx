"use client"

import { Button } from "@raypx/ui/components/button"
import { closeAllToasts, toast } from "@raypx/ui/components/toast"
import { useTheme } from "next-themes"

export default function Home() {
  const { theme, setTheme } = useTheme()

  const onClick = () => {
    toast.success("Hello World")
    setTheme(theme === "dark" ? "light" : "dark")
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
    </div>
  )
}

"use client"

import { Button } from "@raypx/ui/components/button"
import { toast } from "@raypx/ui/components/sonner"

export default function Home() {
  const onClick = () => {
    toast.success("Hello World")
  }
  return (
    <div>
      <Button onClick={onClick}>Click me</Button>
    </div>
  )
}

"use client"

import { toast } from "@raypx/ui/components/sonner"
import { Button } from "@raypx/ui/components/button"

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

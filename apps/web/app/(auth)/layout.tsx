import type { ReactNode } from "react"
import { Suspense } from "react"
import { GuestGuard } from "./_components/guest-guard"

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <Suspense>
        <GuestGuard />
      </Suspense>
    </>
  )
}

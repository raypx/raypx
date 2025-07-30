"use client"

import { Suspense } from "react"
import { SignUpForm } from "../_components/sign-up-form"

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Suspense>
        <SignUpForm />
      </Suspense>
    </div>
  )
}

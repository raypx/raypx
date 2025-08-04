"use client"

import { client } from "@raypx/auth/client"

export function useOrganization() {
  const { organization } = client

  return {
    organization,
    isLoaded: true,
  }
}

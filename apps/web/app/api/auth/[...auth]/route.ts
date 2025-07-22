import { auth, toNextJsHandler } from "@raypx/auth"

const handler = toNextJsHandler(auth)

export const { GET, POST } = handler

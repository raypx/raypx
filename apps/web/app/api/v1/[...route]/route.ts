import { db, schemas } from "@raypx/db"
import { NextResponse } from "next/server"

export const GET = async () => {
  const res = await db.select().from(schemas.page)

  console.log(res)
  return NextResponse.json(res)
}

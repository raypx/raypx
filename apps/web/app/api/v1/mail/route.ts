import { transporter } from "@raypx/email"
import { render } from "@raypx/email/templates"
import { SignInTemplate } from "@raypx/email/templates/sign-in"
import { NextResponse } from "next/server"

export async function GET() {
  const html = await render(
    SignInTemplate({
      name: "John Doe",
      url: "https://raypx.com",
    }),
  )
  console.log(html)
  const info = await transporter.sendMail({
    from: "hello@raypx.com",
    to: "lorenx@163.com",
    subject: "test",
    html,
  })

  return NextResponse.json(info)
}

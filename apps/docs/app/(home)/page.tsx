import { Button } from "@raypx/ui/components/button"
import Link from "next/link"
import appConfig from "@/config/app.config"

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col justify-center text-center">
      <h1 className="mb-4 text-2xl font-bold">Hello World</h1>
      <p className="text-fd-muted-foreground">
        You can open{" "}
        <Link
          href="/docs"
          className="text-fd-foreground font-semibold underline"
        >
          /docs
        </Link>{" "}
        and see the documentation.
      </p>
      <Link href={appConfig.url}>
        <Button className="cursor-pointer">Raypx</Button>
      </Link>
    </main>
  )
}

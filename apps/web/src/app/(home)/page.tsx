import Link from "next/link";

const version = "0.1.0";

export default function HomePage() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-2">
      <div className="grid gap-6">
        <h1 className="bg-linear-to-r from-rose-400 via-fuchsia-500 to-indigo-500 bg-clip-text font-bold text-6xl text-transparent">
          Hello Raypx
        </h1>
        <p className="text-muted-foreground text-sm">Version: {version}</p>
        <Link href="/login">Login</Link>
        <a href="/docs" rel="noopener noreferrer" target="_blank">
          Docs
        </a>
      </div>
    </div>
  );
}

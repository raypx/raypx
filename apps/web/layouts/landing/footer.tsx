import Link from "next/link"
import appConfig from "@/config/app.config"

interface FooterLink {
  href: string
  label: string
}

interface FooterSection {
  title: string
  links: FooterLink[]
}

const sections: FooterSection[] = [
  {
    title: "Product",
    links: [
      { href: "#features", label: "Features" },
      { href: "#pricing", label: "Pricing" },
      { href: "/console", label: "Dashboard" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "#about", label: "About" },
      { href: "#contact", label: "Contact" },
      { href: "#blog", label: "Blog" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "#privacy", label: "Privacy" },
      { href: "#terms", label: "Terms" },
    ],
  },
]

export function Footer() {
  return (
    <footer className="border-t bg-muted/50">
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <div className="h-6 w-6 rounded-full bg-primary" />
              <span className="font-bold">{appConfig.name}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {appConfig.description}
            </p>
          </div>

          {sections.map((section) => (
            <div key={section.title} className="space-y-3">
              <h4 className="text-sm font-semibold">{section.title}</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="hover:text-foreground transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-8 pt-8 border-t text-center text-sm text-muted-foreground">
          <p>
            &copy; {appConfig.year} {appConfig.name}. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}

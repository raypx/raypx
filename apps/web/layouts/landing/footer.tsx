import Link from "next/link"

interface FooterLink {
  href: string
  label: string
}

interface FooterSection {
  title: string
  links: FooterLink[]
}

export interface FooterProps {
  brandName?: string
  brandDescription?: string
  sections?: FooterSection[]
  copyright?: string
}

const defaultSections: FooterSection[] = [
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

export function Footer({
  brandName = "RayPx",
  brandDescription = "Building the future of web applications.",
  sections = defaultSections,
  copyright = "2024 RayPx. All rights reserved.",
}: FooterProps) {
  return (
    <footer className="border-t bg-muted/50">
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <div className="h-6 w-6 rounded-full bg-primary" />
              <span className="font-bold">{brandName}</span>
            </div>
            <p className="text-sm text-muted-foreground">{brandDescription}</p>
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
          <p>&copy; {copyright}</p>
        </div>
      </div>
    </footer>
  )
}

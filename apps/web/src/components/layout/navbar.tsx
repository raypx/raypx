import { SignedIn, SignedOut, UserButton } from "@raypx/auth";
import { ThemeSwitcher } from "@raypx/ui/business/theme-switcher";
import { Button, buttonVariants } from "@raypx/ui/components/button";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from "@raypx/ui/components/navigation-menu";
import { Skeleton } from "@raypx/ui/components/skeleton";
import { cn } from "@raypx/ui/lib/utils";
import { Link, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useScroll } from "@/hooks/use-scroll";
import Container from "./container";
import { Logo } from "./logo";

type NavBarProps = {
  scroll?: boolean;
};

const customNavigationMenuTriggerStyle = cn(
  navigationMenuTriggerStyle(),
  "relative bg-transparent text-muted-foreground cursor-pointer",
  "hover:bg-accent hover:text-accent-foreground",
  "focus:bg-accent focus:text-accent-foreground",
  "data-active:font-semibold data-active:bg-transparent data-active:text-foreground",
  "data-[state=open]:bg-transparent data-[state=open]:text-foreground",
);

export function Navbar({ scroll }: NavBarProps) {
  const scrolled = useScroll(50);
  const [mounted, setMounted] = useState(false);
  const location = useLocation();

  const menuLinks = [
    {
      title: "Home",
      href: "/",
      external: false,
    },
    {
      title: "Docs",
      href: "https://docs.raypx.com",
      external: true,
    },
  ];

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <section
      className={cn(
        "sticky inset-x-0 top-0 z-40 py-4 transition-all duration-300",
        scroll
          ? scrolled
            ? "bg-background/80 backdrop-blur-md border-b supports-backdrop-filter:bg-background/60"
            : "bg-transparent"
          : "border-b bg-background",
      )}
    >
      <Container className="px-4">
        <nav className="hidden lg:flex">
          <div className="flex items-center">
            <Link className="flex items-center space-x-2" to="/">
              <Logo />
              <span className="text-xl font-semibold">Raypx</span>
            </Link>
          </div>
          <div className="flex-1 flex items-center justify-center space-x-2">
            <NavigationMenu className="relative">
              <NavigationMenuList className="flex items-center">
                {menuLinks?.map((item, index) => (
                  <NavigationMenuItem key={index}>
                    <NavigationMenuLink
                      active={
                        item.href === "/"
                          ? location.pathname === "/"
                          : location.pathname.startsWith(item.href)
                      }
                      asChild
                      className={customNavigationMenuTriggerStyle}
                    >
                      <Link target={item.external ? "_blank" : undefined} to={item.href || "#"}>
                        {item.title}
                      </Link>
                    </NavigationMenuLink>
                  </NavigationMenuItem>
                ))}
              </NavigationMenuList>
            </NavigationMenu>
          </div>

          {/* navbar right show sign in or user */}
          <div className="flex items-center gap-x-4 min-w-40 justify-end">
            {!mounted ? (
              <Skeleton className="size-8 border rounded-full" />
            ) : (
              <div className="flex items-center gap-x-4">
                <SignedOut>
                  <Link to="/sign-in">
                    <Button size="sm" variant="outline">
                      Login
                    </Button>
                  </Link>
                  <Link to="/sign-up">
                    <Button size="sm" variant="default">
                      Sign Up
                    </Button>
                  </Link>
                </SignedOut>
                <SignedIn>
                  <UserButton />
                </SignedIn>
              </div>
            )}
            <ThemeSwitcher />
          </div>
        </nav>
      </Container>
    </section>
  );
}

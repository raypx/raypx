import { useAnalytics } from "@raypx/analytics";
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
import { Separator } from "@raypx/ui/components/separator";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@raypx/ui/components/sheet";
import { Skeleton } from "@raypx/ui/components/skeleton";
import { cn } from "@raypx/ui/lib/utils";
import { Link, useLocation } from "@tanstack/react-router";
import { MenuIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { navigation } from "@/config/site";
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
  const analytics = useAnalytics();

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
            : "border-b bg-background"
          : "border-b bg-background",
      )}
    >
      <Container>
        {/* Desktop navbar */}
        <nav aria-label="Primary" className="hidden lg:flex">
          <div className="flex items-center">
            <Link className="flex items-center space-x-2" to="/">
              <Logo />
              <span className="text-xl font-semibold">Raypx</span>
            </Link>
          </div>
          <div className="flex-1 flex items-center justify-center space-x-2">
            <NavigationMenu className="relative">
              <NavigationMenuList className="flex items-center">
                {navigation.main?.map((item, index) => {
                  const isActive =
                    item.href === "/"
                      ? location.pathname === "/"
                      : location.pathname.startsWith(item.href);
                  return (
                    <NavigationMenuItem key={index}>
                      <NavigationMenuLink
                        active={isActive}
                        asChild
                        className={customNavigationMenuTriggerStyle}
                      >
                        {item.external ? (
                          <a href={item.href} rel="noopener noreferrer" target="_blank">
                            {item.title}
                          </a>
                        ) : (
                          <Link aria-current={isActive ? "page" : undefined} to={item.href || "#"}>
                            {item.title}
                          </Link>
                        )}
                      </NavigationMenuLink>
                    </NavigationMenuItem>
                  );
                })}
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
                    <Button
                      onClick={() => {
                        analytics.track("navbar_login_clicked", {
                          location: "navbar",
                          page: location.pathname,
                        });
                      }}
                      size="sm"
                      variant="outline"
                    >
                      Login
                    </Button>
                  </Link>
                  <Link to="/sign-up">
                    <Button
                      onClick={() => {
                        analytics.track("navbar_signup_clicked", {
                          location: "navbar",
                          page: location.pathname,
                        });
                      }}
                      size="sm"
                      variant="default"
                    >
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

        {/* Mobile navbar */}
        <nav aria-label="Primary" className="flex items-center justify-between lg:hidden">
          <Link className="flex items-center space-x-2" to="/">
            <Logo />
            <span className="text-lg font-semibold">Raypx</span>
          </Link>

          <div className="flex items-center gap-2">
            <ThemeSwitcher />
            <Sheet>
              <SheetTrigger asChild>
                <Button aria-label="Open menu" size="icon" variant="ghost">
                  <MenuIcon className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent className="p-0" side="left">
                <SheetHeader className="px-4 py-3">
                  <SheetTitle>
                    <Link className="flex items-center space-x-2" to="/">
                      <Logo />
                      <span className="text-lg font-semibold">Raypx</span>
                    </Link>
                  </SheetTitle>
                </SheetHeader>
                <Separator />
                <div className="flex flex-col p-2">
                  {navigation.main?.map((item, index) => {
                    const isActive =
                      item.href === "/"
                        ? location.pathname === "/"
                        : location.pathname.startsWith(item.href);
                    const content = item.external ? (
                      <a
                        className={cn(
                          buttonVariants({ variant: "ghost", size: "lg" }),
                          "justify-start",
                          isActive && "text-foreground font-medium",
                        )}
                        href={item.href}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        {item.title}
                      </a>
                    ) : (
                      <Link
                        aria-current={isActive ? "page" : undefined}
                        className={cn(
                          buttonVariants({ variant: "ghost", size: "lg" }),
                          "justify-start",
                          isActive && "text-foreground font-medium",
                        )}
                        to={item.href || "#"}
                      >
                        {item.title}
                      </Link>
                    );
                    return (
                      <SheetClose asChild key={index}>
                        {content}
                      </SheetClose>
                    );
                  })}
                </div>
                <Separator />
                <div className="flex flex-col gap-2 p-3">
                  {!mounted ? (
                    <Skeleton className="h-9 w-full" />
                  ) : (
                    <>
                      <SignedOut>
                        <div className="flex gap-2">
                          <SheetClose asChild>
                            <Link className="flex-1" to="/sign-in">
                              <Button className="w-full" variant="outline">
                                Login
                              </Button>
                            </Link>
                          </SheetClose>
                          <SheetClose asChild>
                            <Link className="flex-1" to="/sign-up">
                              <Button className="w-full" variant="default">
                                Sign Up
                              </Button>
                            </Link>
                          </SheetClose>
                        </div>
                      </SignedOut>
                      <SignedIn>
                        <div className="flex items-center justify-between">
                          <div className="text-sm text-muted-foreground">Account</div>
                          <UserButton />
                        </div>
                      </SignedIn>
                    </>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </nav>
      </Container>
    </section>
  );
}

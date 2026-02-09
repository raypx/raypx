import { Footer } from "~/components/layout/footer";
import { Navbar } from "~/components/layout/navbar";

export function Layout(props: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col">
      <Navbar scroll />
      <main className="flex-1">{props.children}</main>
      <Footer />
    </div>
  );
}

import type { Metadata } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "Raypx",
  description: "Raypx",
};

export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return children;
}

import { createFileRoute } from "@tanstack/react-router";
import { publicSeo } from "../lib/public-seo";
import { PublicHome } from "../features/marketing/public-home";

export const Route = createFileRoute("/")({
  component: PublicHome,
  head: ({ matches }) => publicSeo("/", matches, "cloudHomeTitle", "cloudHomeDescription"),
});

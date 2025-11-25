import { createFileRoute } from "@tanstack/react-router";
import { Layout } from "~/layouts/home";

export const Route = createFileRoute("/_home")({
  component: Layout,
});

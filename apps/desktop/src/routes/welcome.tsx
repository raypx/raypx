import { createFileRoute } from "@tanstack/react-router";
import { LocalWelcome } from "../features/onboarding/welcome";
export const Route = createFileRoute("/welcome")({ component: LocalWelcome });

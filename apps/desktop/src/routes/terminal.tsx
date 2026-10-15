import { createFileRoute } from "@tanstack/react-router";
import { TerminalPage } from "../pages/terminal";

export const Route = createFileRoute("/terminal")({ component: TerminalPage });

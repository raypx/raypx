import { createFileRoute } from "@tanstack/react-router";
import { JobsPage } from "../pages/jobs";

export const Route = createFileRoute("/automations")({ component: JobsPage });

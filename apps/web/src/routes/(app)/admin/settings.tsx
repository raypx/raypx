import { createFileRoute } from "@tanstack/react-router";
import { ConfigurationSettings } from "../../../features/configuration/components/settings";

export const Route = createFileRoute("/(app)/admin/settings")({ component: ConfigurationSettings });

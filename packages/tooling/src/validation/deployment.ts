import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { readStaticCatalog } from "@raypx-kit/devkit/catalogs";
import { apiIngress, deploymentServices } from "../build/deployment.js";

interface ComposeService {
  environment?: Record<string, string>;
  healthcheck?: { test: string[] };
  labels?: string[];
}

const compatibilityCopy = (app: "api" | "web", source: string) =>
  `${source}# Generated from apps/${app}/Dockerfile; run bun run raypx-dev deployment:sync.\n`;

/** Keep old Railway build paths usable until the live IaC cutover is complete. */
export function syncDeploymentCompatibility(root: string) {
  for (const app of ["api", "web"] as const) {
    const destination = join(root, `deploy/railway/${app}/Dockerfile`);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(
      destination,
      compatibilityCopy(app, readFileSync(join(root, `apps/${app}/Dockerfile`), "utf8")),
    );
  }
}

/** Check static deployment adapters without importing application runtime code or loading env files. */
export function checkDeployment(root: string): string[] {
  if (!existsSync(join(root, "deploy/compose.yaml"))) return [];
  const read = (file: string) => readFileSync(join(root, file), "utf8");
  const findings: string[] = [];
  try {
    const { services } = Bun.YAML.parse(read("deploy/compose.yaml")) as {
      services: Record<string, ComposeService>;
    };
    const environment = services.api?.environment ?? {};
    const contract = "apps/api/server/env.contract.ts";
    const declared = readStaticCatalog(contract, read(contract));
    if (!declared || typeof declared !== "object" || !Object.keys(declared).length)
      throw new Error("API environment contract missing");
    const template = new Set(
      [...read("deploy/.env.example").matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((match) => match[1]!),
    );
    for (const [key, source] of Object.entries(declared)) {
      if (source !== "derived" && source !== "input") throw new Error("Invalid API setting source");
      if (!(key in environment)) findings.push(`deploy/compose.yaml: API does not forward ${key}`);
      if (source === "input" && !template.has(key))
        findings.push(`deploy/.env.example: missing API setting ${key}`);
    }
    for (const app of ["api", "web"] as const) {
      const service = deploymentServices[app];
      const file = `apps/${app}/Dockerfile`;
      const source = read(file);
      const legacy = `deploy/railway/${app}/Dockerfile`;
      if (!existsSync(join(root, legacy)) || read(legacy) !== compatibilityCopy(app, source))
        findings.push(
          `${legacy}: run bun run raypx-dev deployment:sync to refresh the compatibility copy`,
        );
      const stages = dockerStages(source);
      if (
        ![stages.runtime, stages.final].every(
          (stage) =>
            stage?.environment.get("NITRO_PORT") === String(service.port) &&
            stage.ports.has(String(service.port)),
        )
      )
        findings.push(`${file}: runtime port must be ${service.port}`);
      const health = services[app]?.healthcheck?.test?.join(" ") ?? "";
      if (!health.includes(`http://127.0.0.1:${service.port}${service.ready}`))
        findings.push(
          `deploy/compose.yaml: ${app} healthcheck must use ${service.port}${service.ready}`,
        );
      if (
        !services[app]?.labels?.some((line) =>
          line.endsWith(`.loadbalancer.server.port=${service.port}`),
        )
      )
        findings.push(`deploy/compose.yaml: ${app} proxy port must be ${service.port}`);
    }
    const same = (left: string[], right: string[]) =>
      JSON.stringify(left.sort()) === JSON.stringify(right.sort());
    const caddySource = read("deploy/railway/Caddyfile");
    if (
      !caddySource.includes(`:{$PORT:${deploymentServices.gateway.port}}`) ||
      !read("deploy/railway/Dockerfile")
        .split("\n")
        .includes(`EXPOSE ${deploymentServices.gateway.port}`)
    )
      findings.push("deploy/railway: gateway port differs from the deployment contract");
    const caddy =
      caddySource
        .match(/@api path ([^\n]+)/)?.[1]
        ?.trim()
        .split(/\s+/) ?? [];
    if (!same(caddy, [...apiIngress.prefixes.map((path) => `${path}*`), ...apiIngress.paths]))
      findings.push(
        "deploy/railway/Caddyfile: API ingress routes differ from the deployment contract",
      );
    const rule = services.api?.labels?.find((line) => /-api.rule=/.test(line)) ?? "";
    const traefik = [...rule.matchAll(/(PathPrefix|Path)\(`([^`]+)`\)/g)].map(
      (match) => `${match[1]}:${match[2]}`,
    );
    if (
      !same(traefik, [
        ...apiIngress.prefixes.map((path) => `PathPrefix:${path}`),
        ...apiIngress.paths.map((path) => `Path:${path}`),
      ])
    )
      findings.push("deploy/compose.yaml: API ingress routes differ from the deployment contract");
  } catch {
    findings.push(
      "Deployment contract could not be read; check Compose, Dockerfiles and API environment declarations",
    );
  }
  return findings;
}

interface DockerStage {
  environment: Map<string, string>;
  ports: Set<string>;
}
/** Follow stage inheritance so build-only ENV values cannot satisfy runtime checks. */
function dockerStages(source: string) {
  const stages = new Map<string, DockerStage>();
  let current: DockerStage | undefined;
  for (const line of source.replace(/\\\r?\n/g, " ").split(/\r?\n/)) {
    const from = /^\s*FROM\s+(\S+)(?:\s+AS\s+(\S+))?\s*$/i.exec(line);
    if (from) {
      const base = stages.get(from[1]!.toLowerCase());
      current = { environment: new Map(base?.environment), ports: new Set(base?.ports) };
      if (from[2]) stages.set(from[2].toLowerCase(), current);
      continue;
    }
    if (!current) continue;
    const environment = /^\s*ENV\s+(.+)$/i.exec(line)?.[1];
    if (environment)
      for (const token of environment.matchAll(
        /(?:^|\s)([A-Za-z_][A-Za-z0-9_]*)=(?:"([^"]*)"|'([^']*)'|([^\s]+))/g,
      ))
        current.environment.set(token[1]!, token[2] ?? token[3] ?? token[4]!);
    const expose = /^\s*EXPOSE\s+(.+)$/i.exec(line)?.[1];
    if (expose)
      for (const port of expose.trim().split(/\s+/)) current.ports.add(port.replace(/\/tcp$/i, ""));
  }
  return { runtime: stages.get("runtime"), final: current };
}

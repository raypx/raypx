import { execSync } from "node:child_process"
import type { PlopTypes } from "@turbo/gen"

const PREFIX = "@raypx/"
const NPM_REGISTRY_URL = "https://registry.npmjs.org"

interface PackageAnswers {
  name: string
  deps: string
}

interface NpmPackageInfo {
  latest: string
  [key: string]: string
}

/**
 * Sanitizes the package name by removing the prefix if present
 */
function sanitizePackageName(name: string): string {
  return name.startsWith(PREFIX) ? name.replace(PREFIX, "") : name
}

/**
 * Fetches the latest version of a package from npm registry
 */
async function fetchPackageVersion(packageName: string): Promise<string> {
  try {
    const response = await fetch(
      `${NPM_REGISTRY_URL}/-/package/${encodeURIComponent(packageName)}/dist-tags`,
    )

    if (!response.ok) {
      throw new Error(
        `Failed to fetch package info for ${packageName}: ${response.status}`,
      )
    }

    const data = (await response.json()) as NpmPackageInfo
    return data.latest
  } catch (_error) {
    console.warn(
      `Warning: Could not fetch version for ${packageName}, using "*" as fallback`,
    )
    return "*"
  }
}

/**
 * Processes dependencies and adds them to package.json
 */
async function processDependencies(
  content: string,
  deps: string,
): Promise<string> {
  const pkg = JSON.parse(content)
  pkg.dependencies ??= {}

  const dependencies = deps
    .split(" ")
    .map((dep) => dep.trim())
    .filter(Boolean)

  if (dependencies.length === 0) {
    return JSON.stringify(pkg, null, 2)
  }

  const dependencyPromises = dependencies.map(async (dep) => {
    const version = await fetchPackageVersion(dep)
    return { name: dep, version }
  })

  const resolvedDeps = await Promise.all(dependencyPromises)

  for (const { name, version } of resolvedDeps) {
    pkg.dependencies[name] = `^${version}`
  }

  return JSON.stringify(pkg, null, 2)
}

/**
 * Runs shell commands with proper error handling
 */
function runCommand(command: string, description: string): void {
  try {
    execSync(command, {
      stdio: "inherit",
      cwd: process.cwd(),
    })
  } catch (error) {
    console.error(`Error running ${description}:`, error)
    throw new Error(`Failed to ${description}`)
  }
}

export function createPackageGenerator(plop: PlopTypes.NodePlopAPI) {
  plop.setGenerator("package", {
    description: "Generate a new package for the Monorepo",
    prompts: [
      {
        type: "input",
        name: "name",
        message: `What is the name of the package? (You can skip the \`${PREFIX}\` prefix)`,
        validate: (input: string) => {
          if (!input.trim()) {
            return "Package name is required"
          }
          if (!/^[a-z0-9-]+$/.test(input.replace(PREFIX, ""))) {
            return "Package name must contain only lowercase letters, numbers, and hyphens"
          }
          return true
        },
      },
      {
        type: "input",
        name: "deps",
        message:
          "Enter a space separated list of dependencies you would like to install (optional)",
        default: "",
      },
    ],
    actions: [
      // Sanitize package name
      (answers) => {
        if ("name" in answers && typeof answers.name === "string") {
          answers.name = sanitizePackageName(answers.name)
        }
        return "Package name sanitized"
      },
      // Create package.json
      {
        type: "add",
        path: "packages/{{ name }}/package.json",
        templateFile: "templates/package/package.json.hbs",
      },
      // Create tsconfig.json
      {
        type: "add",
        path: "packages/{{ name }}/tsconfig.json",
        templateFile: "templates/package/tsconfig.json.hbs",
      },
      // Create src/index.ts
      {
        type: "add",
        path: "packages/{{ name }}/src/index.ts",
        templateFile: "templates/package/index.ts.hbs",
      },
      // Process dependencies
      {
        type: "modify",
        path: "packages/{{ name }}/package.json",
        async transform(content: string, answers: PackageAnswers) {
          const deps =
            "deps" in answers && typeof answers.deps === "string"
              ? answers.deps
              : ""
          return await processDependencies(content, deps)
        },
      },
      // Install dependencies and format
      async () => {
        try {
          runCommand("pnpm i", "install dependencies")
          runCommand("pnpm run format", "format code")
          return "Package scaffolded successfully"
        } catch (error) {
          console.error("Failed to complete package setup:", error)
          throw error
        }
      },
    ],
  })
}

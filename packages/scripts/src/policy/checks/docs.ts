import { collectFindings, findingFor } from "../findings.js";
import { join } from "node:path";

import type { PolicyDependencies, PolicyFinding } from "../checks.js";
import { collectRelativeLinks, reachableFrom } from "../links.js";

const docsIndex = "docs/README.md";

export async function checkDocumentationLinks(
  dependencies: PolicyDependencies,
  files: readonly string[],
): Promise<PolicyFinding[]> {
  const { findings, report } = collectFindings(findingFor("docs.links"));
  for (const file of files) {
    const content = await dependencies.readFile(join(dependencies.repositoryRoot, file));
    for (const link of collectRelativeLinks(file, content)) {
      if (await dependencies.pathExists(join(dependencies.repositoryRoot, link.resolved))) continue;
      report(
        file,
        `link target does not exist: ${link.target}`,
        `point the link at an existing path or remove it from ${file}`,
      );
    }
  }
  return findings;
}

export async function checkDocumentationIndex(
  dependencies: PolicyDependencies,
  files: readonly string[],
): Promise<PolicyFinding[]> {
  const indexPath = join(dependencies.repositoryRoot, docsIndex);
  if (!(await dependencies.pathExists(indexPath))) {
    return [
      findingFor("docs.index")(
        docsIndex,
        "the documentation index is missing",
        `create ${docsIndex} and link every document under docs/`,
      ),
    ];
  }

  const documents = files.filter((file) => file.startsWith("docs/"));
  const edges = new Map<string, string[]>();
  for (const file of documents) {
    const links = collectRelativeLinks(
      file,
      await dependencies.readFile(join(dependencies.repositoryRoot, file)),
    );
    edges.set(
      file,
      links.map((link) => link.resolved).filter((target) => target.endsWith(".md")),
    );
  }

  const reachable = reachableFrom(docsIndex, edges);
  return documents
    .filter((file) => !reachable.has(file))
    .map((file) =>
      findingFor("docs.index")(
        file,
        `not reachable from ${docsIndex}`,
        `link ${file} from ${docsIndex} or from a document it already reaches; AGENTS.md declares ${docsIndex} the navigation index`,
      ),
    );
}

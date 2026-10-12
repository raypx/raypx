import { compareMessageCatalogs } from "@voidmix/i18n/testing";
import { finding, type CatalogInput, type I18nFinding } from "./model.js";
type MessageNode = string | { [key: string]: MessageNode };
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMessageNode(value: unknown): value is MessageNode {
  return (
    typeof value === "string" ||
    (isRecord(value) && Object.values(value).every((child) => isMessageNode(child)))
  );
}

function parseCatalog(input: CatalogInput): { findings: I18nFinding[]; value?: MessageNode } {
  try {
    const value: unknown = JSON.parse(input.content);
    if (!isMessageNode(value)) {
      return {
        findings: [
          finding(
            "catalog.parse",
            input.location,
            "catalog root must be an object or string message tree",
            "make the catalog a JSON object whose leaves are strings",
          ),
        ],
      };
    }
    return { findings: [], value };
  } catch {
    return {
      findings: [
        finding(
          "catalog.parse",
          input.location,
          "is not valid JSON",
          "repair the catalog; message files must contain strict JSON",
        ),
      ],
    };
  }
}

/** Checks one pair of locale catalogs without touching the filesystem. */
export function checkCatalogPair(left: CatalogInput, right: CatalogInput): I18nFinding[] {
  const findings: I18nFinding[] = [];
  if (left.surface !== right.surface) {
    findings.push(
      finding(
        "catalog.parity",
        left.location,
        `catalog pair crosses surfaces (${left.surface} and ${right.surface})`,
        "compare catalogs owned by the same surface",
      ),
    );
    return findings;
  }
  if (left.locale === right.locale) {
    findings.push(
      finding(
        "catalog.parity",
        left.location,
        "catalog pair must contain two different locales",
        "provide exactly one en catalog and one zh catalog",
      ),
    );
    return findings;
  }

  const parsedLeft = parseCatalog(left);
  const parsedRight = parseCatalog(right);
  findings.push(...parsedLeft.findings, ...parsedRight.findings);
  if (!parsedLeft.value || !parsedRight.value) return findings;

  return [
    ...findings,
    ...compareMessageCatalogs(parsedLeft.value, parsedRight.value, left.locale, right.locale).map(
      (issue) =>
        finding(
          `catalog.${issue.kind}`,
          `${left.location} <-> ${right.location}`,
          issue.message,
          issue.fix,
        ),
    ),
  ];
}

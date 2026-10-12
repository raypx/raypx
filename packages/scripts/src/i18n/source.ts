import { parseSync, visitorKeys, type Node } from "oxc-parser";
import { finding, type I18nFinding, type SourceInput } from "./model.js";
import {
  uiPropertyNames,
  uiAttributeNames,
  conditionalUiPropertyNames,
  uiVariableSuffix,
  sourceFacadeAllowlist,
  sourceRecoveryAllowlist,
  operationalSourceAllowlist,
  structuredDataSourceAllowlist,
  isLikelyHumanText,
  isLikelyJsxText,
  hasTranslationSibling,
  isLikelyTranslationKey,
} from "./source-rules.js";

interface Literal {
  start: number;
  text: string;
}

/** Only expressions whose value can actually be rendered contribute copy. */
function rendered(node: Node, allowArrow = false): Literal[] {
  switch (node.type) {
    case "Literal":
      return typeof node.value === "string" ? [{ start: node.start, text: node.value }] : [];
    case "TemplateLiteral":
      return node.quasis.map((part) => ({
        start: part.start,
        text: part.value.cooked ?? part.value.raw,
      }));
    case "ConditionalExpression":
      return [...rendered(node.consequent, allowArrow), ...rendered(node.alternate, allowArrow)];
    case "LogicalExpression":
      return [
        ...(node.operator === "&&" ? [] : rendered(node.left, allowArrow)),
        ...rendered(node.right, allowArrow),
      ];
    case "ArrowFunctionExpression":
      return allowArrow ? rendered(node.body) : [];
    case "ParenthesizedExpression":
      return rendered(node.expression, allowArrow);
    default:
      return [];
  }
}

function walk(node: Node, visit: (node: Node, parent?: Node) => void, parent?: Node): void {
  visit(node, parent);
  const record = node as unknown as Record<string, unknown>;
  for (const key of visitorKeys[node.type] ?? []) {
    const child = record[key];
    for (const value of Array.isArray(child) ? child : [child]) {
      if (value && typeof value === "object" && "type" in value) walk(value as Node, visit, node);
    }
  }
}

export function checkSourceFile(source: SourceInput): I18nFinding[] {
  if (
    /\.d\.ts$|(?:^|\/)routeTree\.gen\.ts$|(?:\.test|\.spec)\.[jt]sx?$|\/tests?\//u.test(
      source.location,
    ) ||
    sourceRecoveryAllowlist.has(source.location)
  )
    return [];
  const result = parseSync(source.location, source.content);
  const findings: I18nFinding[] = [];
  const add = (
    offset: number,
    message: string,
    fix: string,
    check: I18nFinding["check"] = "source.hardcoded",
  ) => {
    findings.push(finding(check, source.location, message, fix, source.content, offset));
  };
  if (result.errors.length) {
    for (const error of result.errors)
      add(
        error.labels[0]?.start ?? 0,
        error.message,
        "repair source syntax before checking translations",
        "source.parse",
      );
    return findings;
  }
  const text = (items: Literal[]) => {
    for (const item of items)
      if (isLikelyJsxText(item.text))
        add(
          item.start,
          `JSX contains hardcoded user-facing text: ${item.text.replace(/\s+/g, " ").trim()}`,
          "move the text into the owning en/zh catalog and render it through the typed translator",
        );
  };
  const uiValue = (items: Literal[], kind: string, label: string, fix: string) => {
    for (const item of items)
      if (!isLikelyTranslationKey(item.text) && isLikelyHumanText(item.text)) {
        add(item.start, `${kind} ${label} contains hardcoded user-facing text`, fix);
      }
  };
  walk(result.program, (node, parent) => {
    switch (node.type) {
      case "ImportDeclaration": {
        if (sourceFacadeAllowlist.has(source.location)) break;
        if (node.source.value === "@voidmix/i18n/client") {
          for (const specifier of node.specifiers) {
            if (
              specifier.type === "ImportSpecifier" &&
              specifier.imported.type === "Identifier" &&
              specifier.imported.name === "useTranslations"
            ) {
              add(
                specifier.start,
                "imports useTranslations directly from @voidmix/i18n/client",
                "import the surface-local typed translation facade instead",
                "source.facade",
              );
            }
          }
        }
        if (/^use-intl(?:\/|$)/u.test(node.source.value))
          add(
            node.source.start,
            "imports the use-intl implementation directly",
            "keep use-intl behind @voidmix/i18n",
            "source.facade",
          );
        break;
      }
      case "JSXText":
        text([{ start: node.start, text: node.value }]);
        break;
      case "JSXExpressionContainer":
        if (parent?.type === "JSXElement" || parent?.type === "JSXFragment")
          text(rendered(node.expression));
        break;
      case "JSXAttribute": {
        if (node.name.type !== "JSXIdentifier" || !node.value) break;
        const name = node.name.name;
        const value =
          node.value.type === "JSXExpressionContainer" ? node.value.expression : node.value;
        if (uiAttributeNames.has(name.toLowerCase()))
          uiValue(
            rendered(value),
            "JSX attribute",
            name,
            "use a typed translation key for this attribute",
          );
        if (name === "children" || /^render(?:[A-Z].*)?$/u.test(name)) text(rendered(value, true));
        break;
      }
      case "Property": {
        if (
          node.computed ||
          structuredDataSourceAllowlist.some((pattern) => pattern.test(source.location))
        )
          break;
        const name =
          node.key.type === "Identifier"
            ? node.key.name
            : node.key.type === "Literal"
              ? String(node.key.value)
              : "";
        const propertyNames =
          node.value.type === "ConditionalExpression"
            ? conditionalUiPropertyNames
            : uiPropertyNames;
        if (
          !propertyNames.has(name) ||
          hasTranslationSibling(source.content, node.value.start, name)
        )
          break;
        uiValue(
          rendered(node.value),
          "UI property",
          name,
          "store the display value as a locale key and translate it at the render boundary",
        );
        break;
      }
      case "VariableDeclarator":
        if (
          node.id.type === "Identifier" &&
          uiVariableSuffix.test(node.id.name) &&
          node.init?.type === "ConditionalExpression"
        ) {
          uiValue(
            rendered(node.init),
            "UI variable",
            node.id.name,
            "store the value in the owning catalog and resolve it through the typed translator",
          );
        }
        break;
      case "CallExpression":
      case "NewExpression": {
        const name = source.content.slice(node.callee.start, node.callee.end);
        const first = node.arguments[0];
        if (!first) break;
        if (
          (name === "Error" || name === "setError") &&
          !operationalSourceAllowlist.some((pattern) => pattern.test(source.location))
        ) {
          for (const item of rendered(first))
            if (isLikelyHumanText(item.text))
              add(
                item.start,
                `raw ${name} message can bypass the error translation map`,
                "return a stable error code and translate it at the UI boundary",
              );
        }
        if (
          /(?:Intl\.(?:DateTimeFormat|NumberFormat|RelativeTimeFormat)|toLocale(?:String|DateString)|createFormatter)$/u.test(
            name,
          )
        ) {
          for (const item of rendered(first))
            if (/^(?:en|zh|en-[A-Z]{2}|zh-[A-Z]{2})$/u.test(item.text))
              add(
                item.start,
                `formatting call hardcodes locale ${item.text}`,
                "pass the active locale to the shared formatter",
                "source.locale",
              );
        }
        break;
      }
    }
  });
  return findings.sort((left, right) => left.line - right.line || left.column - right.column);
}

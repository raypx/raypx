import { resolve } from "node:path";
import { DOMParser } from "@xmldom/xmldom";

export function bunReportName(name: string) {
  return name.replace(/\.json$/, ".xml");
}

export function readBunReport(directory: string, xml: string) {
  const document = new DOMParser({
    onError(level, message) {
      throw new Error(`Invalid Bun test report (${level}): ${message}`);
    },
  }).parseFromString(xml, "application/xml");
  const suites = document.documentElement;
  if (suites?.tagName !== "testsuites" || suites.getAttribute("name") !== "bun test")
    throw new Error("Expected a Bun JUnit test report");

  return {
    success: true,
    numFailedTests: Number(suites.getAttribute("failures") ?? NaN),
    numPendingTests: Number(suites.getAttribute("skipped") ?? NaN),
    numPassedTests: Number(suites.getAttribute("tests") ?? NaN),
    testResults: Array.from(suites.getElementsByTagName("testsuite"))
      .filter((suite) => suite.parentNode === suites)
      .map((suite) => {
        const file = suite.getAttribute("file");
        if (!file) throw new Error("Missing file in Bun test report");
        return {
          name: resolve(directory, file),
          assertionResults: Array.from(suite.getElementsByTagName("testcase")).map((test) => {
            const names = [test.getAttribute("name")];
            if (!names[0] || test.getAttribute("file") !== file)
              throw new Error("Invalid case identity in Bun test report");
            // Bun nests describe blocks in JUnit. Reconstruct the full Vitest case name.
            for (let group = test.parentNode; group && group !== suite; group = group.parentNode) {
              if (group.nodeType !== 1 || group.nodeName !== "testsuite")
                throw new Error("Invalid case group in Bun test report");
              names.unshift((group as typeof suite).getAttribute("name"));
            }
            const unpassed = ["failure", "error", "skipped"].some(
              (tag) => test.getElementsByTagName(tag).length,
            );
            return {
              fullName: names.join(" "),
              status: unpassed ? "unpassed" : "passed",
              duration: Number(test.getAttribute("time") ?? 0) * 1000,
            };
          }),
        };
      }),
  };
}

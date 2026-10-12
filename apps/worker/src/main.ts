import { createCloudWorkerRuntime } from "./runtime.js";
import { renderReport, renderTable, renderDeck } from "./tools/render.js";
import { checkPiRuntime } from "@voidmix/ai";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDocumentEnvironment } from "./env.js";
import { extractFile } from "./tools/files.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { runnerEnvironment } from "./process-executor.js";

export async function checkRuntime(): Promise<void> {
  await checkPiRuntime();
  await promisify(execFile)(
    process.execPath,
    [fileURLToPath(new URL("./runner.mjs", import.meta.url)), "--check"],
    { env: runnerEnvironment(), timeout: 30_000 },
  );
  const pdf = await renderReport(
    { title: "Runtime check", sections: [{ heading: "Verification", body: "Actual PDF output." }] },
    { directory: "." },
  );
  const xlsx = await renderTable("Runtime check", [
    { name: "Data", columns: ["Value"], rows: [[1]], notes: [] },
  ]);
  if (
    pdf[1]?.mediaType !== "application/pdf" ||
    xlsx[0]?.mediaType !== "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  )
    throw new Error("Document runtime check failed.");
  process.stdout.write(
    "Voidmix Worker and isolated Runner Node artifacts, Pi assets, PDF and XLSX runtime verified.\n",
  );
}

export async function checkDocuments(): Promise<void> {
  const env = getDocumentEnvironment();
  const directory = await mkdtemp(join(tmpdir(), "voidmix-document-check-"));
  const options = {
    directory,
    fontPath: env.CLOUD_PDF_FONT_PATH ?? "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    fontFamily: env.CLOUD_PDF_FONT_FAMILY ?? "NotoSansCJKsc-Regular",
    fontFace: env.CLOUD_PPTX_FONT_FACE,
    libreOfficePath: env.SOFFICE_BINARY,
    pdfToTextPath: env.PDFTOTEXT_BINARY,
    pdfInfoPath: env.PDFINFO_BINARY,
  };
  try {
    const report = await renderReport(
      { title: "云端研究报告", sections: [{ heading: "分析结果", body: "中文内容与真实数据。" }] },
      options,
    );
    if (
      !(await extractFile(report[1]!.body, "application/pdf", "report.pdf", options)).text.includes(
        "云端研究报告",
      )
    )
      throw new Error("Chinese report PDF text verification failed.");
    const spreadsheet = await renderTable("分析", [
      { name: "数据", columns: ["名称", "值"], rows: [["中文", 30]], notes: [] },
    ]);
    if (
      (await extractFile(spreadsheet[0]!.body, spreadsheet[0]!.mediaType, "data.xlsx")).tables[0]
        ?.rows[0]?.[0] !== "中文"
    )
      throw new Error("Chinese spreadsheet verification failed.");
    const deck = await renderDeck(
      {
        title: "研究汇报",
        slides: Array.from({ length: 8 }, (_, index) => ({
          title: `分析 ${index + 1}`,
          bullets: ["已验证的数据", "可审阅的交付"],
        })),
      },
      options,
    );
    if (
      !(await extractFile(deck[1]!.body, "application/pdf", "preview.pdf", options)).text.includes(
        "分析",
      )
    )
      throw new Error("Chinese presentation PDF text verification failed.");
    process.stdout.write(
      "Voidmix Chinese PDF, XLSX and actual eight-page PPTX/PDF conversion verified.\n",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

if (process.argv.includes("--check-documents")) await checkDocuments();
else if (process.argv.includes("--check")) await checkRuntime();
else {
  const signal = new AbortController();
  const stop = () => signal.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  const runtime = await createCloudWorkerRuntime();
  try {
    await runtime.run(signal.signal);
  } finally {
    await runtime.close();
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}

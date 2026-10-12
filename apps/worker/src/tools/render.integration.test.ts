import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { expect, it } from "vite-plus/test";
import { renderDeck, renderReport } from "./render.js";
import { extractFile } from "./files.js";

const fontPath =
  process.env.CLOUD_PDF_FONT_PATH ??
  (existsSync("/System/Library/Fonts/STHeiti Light.ttc")
    ? "/System/Library/Fonts/STHeiti Light.ttc"
    : "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc");
const fontFamily =
  process.env.CLOUD_PDF_FONT_FAMILY ??
  (fontPath.includes("STHeiti") ? "STHeitiSC-Light" : "NotoSansCJKsc-Regular");
let office = process.env.SOFFICE_BINARY ?? "";
if (!office)
  try {
    office = execFileSync("which", ["soffice"], { encoding: "utf8" }).trim();
  } catch {
    /* Explicitly unavailable on machines without the converter. */
  }
let pdfToTextPath = process.env.PDFTOTEXT_BINARY ?? "",
  pdfInfoPath = process.env.PDFINFO_BINARY ?? "";
if (!pdfToTextPath)
  try {
    pdfToTextPath = execFileSync("which", ["pdftotext"], { encoding: "utf8" }).trim();
    pdfInfoPath = execFileSync("which", ["pdfinfo"], { encoding: "utf8" }).trim();
  } catch {
    /* Native PDF parsing is required for this integration. */
  }

it.skipIf(!existsSync(fontPath) || !pdfToTextPath)(
  "renders a real Chinese PDF and extracts its text layer",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "voidmix-pdf-test-"));
    try {
      const files = await renderReport(
        {
          title: "云端研究报告",
          sections: [{ heading: "分析结果", body: "可信数据的总计为三十。" }],
        },
        { directory, fontPath, fontFamily },
      );
      expect(Buffer.from(files[1]!.body.subarray(0, 4)).toString()).toBe("%PDF");
      const extracted = await extractFile(files[1]!.body, "application/pdf", files[1]!.name, {
        pdfToTextPath,
        pdfInfoPath,
      });
      expect(extracted.text).toContain("云端研究报告");
      expect(extracted.text).toContain("可信数据");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  30_000,
);

it.skipIf(!office || !pdfInfoPath)(
  "converts a real eight-slide PPTX into an eight-page PDF preview",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "voidmix-deck-test-"));
    try {
      const files = await renderDeck(
        {
          title: "研究汇报",
          slides: Array.from({ length: 8 }, (_, index) => ({
            title: `分析 ${index + 1}`,
            bullets: ["已验证的数据", "可审阅的交付"],
          })),
        },
        {
          directory,
          libreOfficePath: office,
          pdfInfoPath,
          fontFace:
            process.env.CLOUD_PPTX_FONT_FACE ??
            (process.platform === "darwin" ? "Heiti SC" : "Noto Sans CJK SC"),
        },
      );
      expect(files.map((file) => file.mediaType)).toEqual([
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/pdf",
      ]);
      expect(Buffer.from(files[0]!.body.subarray(0, 2)).toString()).toBe("PK");
      const extracted = await extractFile(files[1]!.body, "application/pdf", "preview.pdf", {
        pdfToTextPath,
        pdfInfoPath,
      });
      expect(extracted.text).toContain("分析");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  120_000,
);

import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { passwordResetEmail, verificationEmail, welcomeEmail } from "../src/templates/index.js";

const baseUrl = "http://localhost:3000";
const directory = await mkdtemp(join(tmpdir(), "voidmix-email-preview-"));
const previews = [
  {
    file: "email-verification.html",
    rendered: await verificationEmail({
      email: "alex@example.com",
      name: "Alex",
      url: `${baseUrl}/verify-email?token=preview-token`,
    }),
  },
  {
    file: "password-reset.html",
    rendered: await passwordResetEmail({
      email: "alex@example.com",
      name: "Alex",
      url: `${baseUrl}/reset-password?token=preview-token`,
    }),
  },
  {
    file: "welcome.html",
    rendered: await welcomeEmail({
      email: "alex@example.com",
      name: "Alex",
      appUrl: baseUrl,
    }),
  },
];

await Promise.all(
  previews.map(({ file, rendered }) => writeFile(join(directory, file), rendered.html)),
);
await writeFile(
  join(directory, "index.html"),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Voidmix email previews</title></head><body><h1>Voidmix email previews</h1><ul>${previews.map(({ file, rendered }) => `<li><a href="./${file}">${rendered.subject}</a></li>`).join("")}</ul></body></html>`,
);

process.stdout.write(`${join(directory, "index.html")}\n`);

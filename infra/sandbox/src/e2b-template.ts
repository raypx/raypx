import { Template } from "e2b";

const apiKey = process.env.E2B_API_KEY;
const name = process.argv[2];
const baseImage = process.argv[3];
if (!apiKey || !name || !baseImage?.match(/^python:3\.13-slim-bookworm@sha256:[a-f0-9]{64}$/))
  throw new Error(
    "Provide E2B_API_KEY, a new template name, and a digest-pinned python:3.13-slim-bookworm image.",
  );

const template = Template({ fileContextPath: import.meta.dir })
  .fromImage(baseImage)
  .runCmd(
    "apt-get update && apt-get install -y --no-install-recommends coreutils git ca-certificates python3 && rm -rf /var/lib/apt/lists/*" +
      " && useradd --create-home --shell /bin/sh computer" +
      " && install -d -m 0755 /opt/raypx" +
      " && install -m 0444 /dev/null /opt/raypx/process.lock" +
      " && install -d -o computer -g computer -m 0700 /home/computer/workspace",
    { user: "root" },
  )
  .copy("home.py", "/opt/raypx/home.py")
  .copy("e2b.py", "/opt/raypx/e2b.py")
  .setUser("computer")
  .setWorkdir("/home/computer/workspace");

try {
  const { templateId } = await Template.build(template, name, {
    apiKey,
    domain: "e2b.app",
    apiUrl: "https://api.e2b.app",
    debug: false,
  });
  process.stdout.write(`${templateId}\n`);
} catch {
  throw new Error("E2B template build failed. Check the project and build status in E2B.");
}

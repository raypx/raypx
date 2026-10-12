import { describe, expect, it } from "vite-plus/test";

import { passwordResetEmail, verificationEmail, welcomeEmail } from "./index.js";

describe("authentication email templates", () => {
  it.each([
    ["verification", verificationEmail, "Verify your Voidmix email"],
    ["password reset", passwordResetEmail, "Reset your Voidmix password"],
  ])("renders deterministic %s HTML and text", async (_name, template, subject) => {
    const input = {
      email: "alex@example.com",
      name: "Alex",
      url: "https://admin.example.com/action?token=secret",
    };

    const first = await template(input);
    const second = await template(input);

    expect(first).toEqual(second);
    expect(first.subject).toBe(subject);
    expect(first.html).toContain("Alex");
    expect(first.html).toContain("https://admin.example.com/action?token=secret");
    expect(first.text).toContain("https://admin.example.com/action?token=secret");
  });

  it("renders the welcome email with HTML and plain text", async () => {
    const rendered = await welcomeEmail({
      email: "alex@example.com",
      name: "Alex",
      appUrl: "https://admin.example.com",
    });

    expect(rendered.subject).toBe("Welcome to Voidmix");
    expect(rendered.html).toContain("Open Voidmix");
    expect(rendered.text).toContain("https://admin.example.com");
  });

  it("escapes dynamic HTML input", async () => {
    const rendered = await verificationEmail({
      email: "alex@example.com",
      name: '<script>alert("name")</script>',
      url: "https://admin.example.com/verify?value=<script>alert(1)</script>",
    });

    expect(rendered.html).not.toContain('<script>alert("name")</script>');
    expect(rendered.html).toContain("&lt;script&gt;");
  });

  it("renders one deterministic Chinese locale across subject, HTML, and text", async () => {
    const input = {
      email: "alex@example.com",
      name: "小明",
      url: "https://admin.example.com/verify?token=secret",
    };

    const first = await verificationEmail(input, "zh");
    const second = await verificationEmail(input, "zh");

    expect(first).toEqual(second);
    expect(first.subject).toBe("验证你的 Voidmix 邮箱");
    expect(first.html).toContain('lang="zh"');
    expect(first.html).toContain("你好，小明：");
    expect(first.text).toContain("验证邮箱");
  });
});

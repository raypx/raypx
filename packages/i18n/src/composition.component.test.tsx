import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vite-plus/test";
import { createBrowserI18n, createTranslations, useLanguagePreference } from "./browser.js";
import commonEn from "../locales/en/index.js";
import commonZh from "../locales/zh/index.js";
import en from "../tests/fixtures/en.json" with { type: "json" };
import zh from "../tests/fixtures/zh.json" with { type: "json" };

const application = createBrowserI18n<typeof commonEn & typeof en>({
  en: { ...commonEn, ...en },
  zh: { ...commonZh, ...zh },
});
const useFeatureTranslations = createTranslations<typeof en>();
const useCommonTranslations = createTranslations<typeof commonEn>();

beforeEach(() => localStorage.clear());
afterEach(cleanup);

function Feature() {
  const t = useFeatureTranslations("probe");
  const common = useCommonTranslations("common");
  const { setPreference } = useLanguagePreference();
  return (
    <>
      <p>{t("greeting", { name: "Ada" })}</p>
      <p>{t("count", { count: 2 })}</p>
      <p>{common("save")}</p>
      <input aria-label="Draft" defaultValue="" />
      <button onClick={() => setPreference("zh")}>Chinese</button>
    </>
  );
}

function ApplicationView() {
  const t = application.useTranslations("probe");
  return <p>{t("greeting", { name: "Lin" })}</p>;
}

it("shares messages and preference state across independently typed TS/JSON bindings", () => {
  render(
    <application.BrowserLanguageProvider initialPreference="en" restorePreference={false}>
      <Feature />
      <ApplicationView />
    </application.BrowserLanguageProvider>,
  );
  expect(screen.getByText("Hello Ada")).toBeTruthy();
  expect(screen.getByText("Hello Lin")).toBeTruthy();
  expect(screen.getByText("2 items")).toBeTruthy();
  expect(screen.getByText("Save changes")).toBeTruthy();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "keep this draft" } });
  fireEvent.click(screen.getByRole("button", { name: "Chinese" }));
  expect(screen.getByText("你好 Ada")).toBeTruthy();
  expect(screen.getByText("你好 Lin")).toBeTruthy();
  expect(screen.getByText("2 项")).toBeTruthy();
  expect(screen.getByText("保存更改")).toBeTruthy();
  expect(screen.getByRole("textbox")).toHaveProperty("value", "keep this draft");
});

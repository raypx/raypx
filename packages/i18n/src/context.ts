import { AsyncLocalStorage } from "node:async_hooks";
import type { i18n as I18nInstance } from "i18next";
import type { Promisable } from "type-fest";
import type { I18nRequestContext } from "./types";

const storage = new AsyncLocalStorage<I18nInstance>();

export const setRequestI18n: I18nRequestContext["setRequestI18n"] = (instance: I18nInstance) => {
  storage.enterWith(instance);
};

export const getRequestI18n: I18nRequestContext["getRequestI18n"] = () => storage.getStore();

export const runWithRequestI18n: I18nRequestContext["runWithRequestI18n"] = async <T>(
  instance: I18nInstance,
  callback: () => Promisable<T>,
) => {
  return storage.run(instance, callback);
};

export const i18nRequestContext: I18nRequestContext = {
  getRequestI18n,
  runWithRequestI18n,
  setRequestI18n,
};

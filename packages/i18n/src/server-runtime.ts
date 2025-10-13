import { AsyncLocalStorage } from "node:async_hooks";
import type { i18n as I18nInstance } from "i18next";

const storage = new AsyncLocalStorage<I18nInstance>();

export const setRequestI18n = (instance: I18nInstance) => {
  storage.enterWith(instance);
};

export const getRequestI18n = () => storage.getStore();

export const runWithRequestI18n = async <T>(
  instance: I18nInstance,
  callback: () => Promise<T> | T,
) => {
  return storage.run(instance, callback);
};

export const i18nRequestContext = {
  getRequestI18n,
  runWithRequestI18n,
  setRequestI18n,
};

export type I18nRequestContext = typeof i18nRequestContext;

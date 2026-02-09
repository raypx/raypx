/**
 * Virtual module utility
 * Copied from @raypx/core/src/vite/virtual-module.ts
 */

export function create(name: string) {
  const id = `virtual:emails/${name}`;
  return {
    id,
    resolvedId: `\0${id}`,
    url: `/@id/__x00__${id}`,
  };
}

export default {
  create,
};

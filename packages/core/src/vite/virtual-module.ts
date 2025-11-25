export function create(name: string) {
  const id = `virtual:raypx-core/${name}`;
  return {
    id,
    resolvedId: `\0${id}`,
    url: `/@id/__x00__${id}`,
  };
}

export default {
  create,
};

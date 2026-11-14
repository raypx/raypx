const identities = new WeakMap<object, number>();
let sequence = 0;
export function memoryClientKey(client: object) {
  let id = identities.get(client);
  if (id === undefined) identities.set(client, (id = ++sequence));
  return id;
}

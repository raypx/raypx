import { defineMeta, type AnyProcedureContract } from "@orpc/contract";

type ApiConsumer = "renderer" | "native" | "host" | "web";

const [exposeApiTo, getApiConsumer] = defineMeta(
  "raypx.apiExposure",
  (consumer: ApiConsumer) => consumer,
);
export { exposeApiTo };

export function collectApiExposure(
  contract: Readonly<Record<string, Readonly<Record<string, AnyProcedureContract>>>>,
): Readonly<Record<string, Readonly<Record<string, ApiConsumer>>>> {
  const groups: Record<string, Record<string, ApiConsumer>> = Object.create(null);
  for (const [group, procedures] of Object.entries(contract)) {
    const methods: Record<string, ApiConsumer> = Object.create(null);
    for (const [method, procedure] of Object.entries(procedures)) {
      const consumer = getApiConsumer(procedure);
      if (consumer !== undefined) methods[method] = consumer;
    }
    groups[group] = methods;
  }
  return groups;
}

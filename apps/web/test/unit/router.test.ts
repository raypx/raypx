import { expect, test } from "vite-plus/test";
import { getRouter } from "../../src/router";

test("independent SSR routers cannot share an account query cache", async () => {
  const first = getRouter();
  const second = getRouter();
  const firstClient = first.options.context.queryClient;
  const secondClient = second.options.context.queryClient;
  try {
    await Promise.all([
      firstClient.fetchQuery({
        queryKey: ["account", "current"],
        queryFn: () => ({ name: "Alice" }),
      }),
      secondClient.fetchQuery({
        queryKey: ["account", "current"],
        queryFn: () => ({ name: "Bob" }),
      }),
    ]);
    expect(firstClient.getQueryData(["account", "current"])).toEqual({ name: "Alice" });
    expect(secondClient.getQueryData(["account", "current"])).toEqual({ name: "Bob" });
    firstClient.removeQueries({ queryKey: ["account"] });
    expect(secondClient.getQueryData(["account", "current"])).toEqual({ name: "Bob" });
  } finally {
    firstClient.clear();
    secondClient.clear();
  }
});

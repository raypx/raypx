export async function checkReadiness(probes: Record<string, () => Promise<unknown>>) {
  return Object.fromEntries(
    await Promise.all(
      Object.entries(probes).map(async ([name, probe]) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const ok = await Promise.race([
            Promise.resolve()
              .then(probe)
              .then(
                () => true,
                () => false,
              ),
            new Promise<boolean>((resolve) => {
              timer = setTimeout(() => resolve(false), 3000);
            }),
          ]);
          return [name, ok ? ("ok" as const) : ("unavailable" as const)];
        } finally {
          clearTimeout(timer);
        }
      }),
    ),
  );
}

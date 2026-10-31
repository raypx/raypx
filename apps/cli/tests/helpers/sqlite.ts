import { rmSync } from "node:fs";
import { resolve, sep } from "node:path";
import { afterEach } from "vite-plus/test";
import { ProfileStorage } from "../../src/runtime/sqlite";

const profiles: ProfileStorage[] = [];
afterEach(() => {
  for (const profile of profiles.splice(0).reverse()) profile.close();
});
/** Each test explicitly owns its profile, including independent reopen connections. */
export function profileStorage(directory: string) {
  const profile = new ProfileStorage(directory);
  profiles.push(profile);
  return profile;
}

export function closeProfileStorage(path: string) {
  const directory = resolve(path);
  for (let index = profiles.length - 1; index >= 0; index--) {
    const profile = profiles[index]!;
    if (profile.directory === directory || profile.directory.startsWith(directory + sep)) {
      profile.close();
      profiles.splice(index, 1);
    }
  }
}
export function removeProfileDirectory(path: string, options: Parameters<typeof rmSync>[1]) {
  closeProfileStorage(path);
  rmSync(path, options);
}

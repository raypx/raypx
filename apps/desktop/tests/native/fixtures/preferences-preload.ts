import { runInNewContext } from "node:vm";
import {
  DEVICE_PREFERENCES_KEY,
  isDevicePreferences,
  type NativePreferenceSnapshot,
} from "../../../preferences";

/** Execute either host's actual preload and inspect JSON identity in its own JS realm. */
function inspectPreferencePreload(script: string) {
  const inspection = runInNewContext(
    `${script};(()=>{
      const snapshot=window[${JSON.stringify(DEVICE_PREFERENCES_KEY)}];
      const raw=snapshot.raw;
      return {
        snapshot,
        ownProto:Object.hasOwn(raw,"__proto__")&&Object.hasOwn(raw.nested,"__proto__"),
        prototypeUnchanged:Object.getPrototypeOf(raw)===Object.prototype&&Object.getPrototypeOf(raw.nested)===Object.prototype,
        inheritedPollution:"polluted" in raw||"polluted" in raw.nested,
        globalsClean:!Object.hasOwn(Object.prototype,"polluted"),
        deepFrozen:[snapshot,raw,raw.__proto__,raw.nested,raw.nested.__proto__].every(Object.isFrozen)
      };
    })()`,
    { window: {} },
  ) as {
    snapshot: NativePreferenceSnapshot;
    ownProto: boolean;
    prototypeUnchanged: boolean;
    inheritedPollution: boolean;
    globalsClean: boolean;
    deepFrozen: boolean;
  };
  return { ...inspection, valid: isDevicePreferences(inspection.snapshot.raw) };
}

if (import.meta.main) {
  const input = JSON.parse(await Bun.stdin.text()) as { script: string };
  console.info(JSON.stringify(inspectPreferencePreload(input.script)));
}

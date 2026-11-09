import { createCn } from "cn/config";

// Keep semantic control spacing in the same conflict groups as Tailwind's sizes.
// Otherwise h-control survives h-auto and the generated CSS order wins.
export const cn = createCn({
  extend: {
    theme: {
      spacing: ["control-xs", "control-sm", "control", "control-lg", "control-xl"],
    },
  },
});

import { createCn } from "cn/config";

// Merge shared focus treatments as ring widths so triggers can switch treatments
// and grouped editors can suppress their inner ring. Semantic control spacing
// belongs with Tailwind sizes so h-auto can override h-control.
export const cn = createCn({
  extend: {
    classGroups: {
      "ring-w": ["focus-entry", "focus-control", "invalid-control"],
    },
    theme: {
      spacing: ["control-xs", "control-sm", "control", "control-lg", "control-xl"],
    },
  },
});

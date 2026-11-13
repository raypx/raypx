// Load matcher types while registering with the runner's own expect.
// oxlint-disable-next-line import/no-empty-named-blocks, unicorn/require-module-specifiers
import type {} from "@testing-library/jest-dom/vitest";
import * as matchers from "@testing-library/jest-dom/matchers";
import { cleanup, configure } from "@testing-library/react";
import { afterEach, expect } from "vitest";

expect.extend(matchers);
// The default one-second wait is too short for the conversation suites on a loaded CI runner.
configure({ asyncUtilTimeout: 5000 });
const motion = document.createElement("style");
motion.textContent = "*,*::before,*::after{animation:none!important;transition:none!important}";
document.head.append(motion);
afterEach(cleanup);

import { host } from "./react-native.js";

// Native SVG is imported eagerly by Markdown's renderer, even though reply
// images use descriptions. Keep that native boundary observable in tests.
export const SvgFromXml = host("SvgFromXml");

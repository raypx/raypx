import * as cloud from "./cloud.js";
import * as identity from "./identity.js";
import * as projects from "./projects.js";
import {
  v2Assets,
  v2AssetVersions,
  v2Reviews,
  v2Feedback,
  v2Activities,
  outboxEvents,
} from "./resources.js";

/** The runtime graph matches the fresh baseline; retired tables stay in historical modules. */
export const schema = {
  ...identity,
  ...projects,
  ...cloud,
  v2Assets,
  v2AssetVersions,
  v2Reviews,
  v2Feedback,
  v2Activities,
  outboxEvents,
};

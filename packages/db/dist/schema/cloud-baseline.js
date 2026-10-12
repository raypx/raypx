"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.v2ReviewStatusEnum = exports.projectTaskStatusEnum = exports.v2ProjectMemberStatusEnum = exports.v2ProjectMemberRoleEnum = exports.projectStageEnum = exports.organizationMembershipStatusEnum = exports.organizationRoleEnum = exports.auditTargetTypeEnum = exports.auditActionEnum = exports.userStatusEnum = exports.roleEnum = exports.outboxEvents = exports.v2Activities = exports.v2Feedback = exports.v2Reviews = exports.v2AssetVersions = exports.v2Assets = void 0;
// Fresh database baseline. Historical migrations and local/legacy schemas remain separate.
__exportStar(require("./identity.js"), exports);
__exportStar(require("./projects.js"), exports);
var resources_js_1 = require("./resources.js");
Object.defineProperty(exports, "v2Assets", { enumerable: true, get: function () { return resources_js_1.v2Assets; } });
Object.defineProperty(exports, "v2AssetVersions", { enumerable: true, get: function () { return resources_js_1.v2AssetVersions; } });
Object.defineProperty(exports, "v2Reviews", { enumerable: true, get: function () { return resources_js_1.v2Reviews; } });
Object.defineProperty(exports, "v2Feedback", { enumerable: true, get: function () { return resources_js_1.v2Feedback; } });
Object.defineProperty(exports, "v2Activities", { enumerable: true, get: function () { return resources_js_1.v2Activities; } });
Object.defineProperty(exports, "outboxEvents", { enumerable: true, get: function () { return resources_js_1.outboxEvents; } });
__exportStar(require("./cloud.js"), exports);
var enums_js_1 = require("./enums.js");
Object.defineProperty(exports, "roleEnum", { enumerable: true, get: function () { return enums_js_1.roleEnum; } });
Object.defineProperty(exports, "userStatusEnum", { enumerable: true, get: function () { return enums_js_1.userStatusEnum; } });
Object.defineProperty(exports, "auditActionEnum", { enumerable: true, get: function () { return enums_js_1.auditActionEnum; } });
Object.defineProperty(exports, "auditTargetTypeEnum", { enumerable: true, get: function () { return enums_js_1.auditTargetTypeEnum; } });
Object.defineProperty(exports, "organizationRoleEnum", { enumerable: true, get: function () { return enums_js_1.organizationRoleEnum; } });
Object.defineProperty(exports, "organizationMembershipStatusEnum", { enumerable: true, get: function () { return enums_js_1.organizationMembershipStatusEnum; } });
Object.defineProperty(exports, "projectStageEnum", { enumerable: true, get: function () { return enums_js_1.projectStageEnum; } });
Object.defineProperty(exports, "v2ProjectMemberRoleEnum", { enumerable: true, get: function () { return enums_js_1.v2ProjectMemberRoleEnum; } });
Object.defineProperty(exports, "v2ProjectMemberStatusEnum", { enumerable: true, get: function () { return enums_js_1.v2ProjectMemberStatusEnum; } });
Object.defineProperty(exports, "projectTaskStatusEnum", { enumerable: true, get: function () { return enums_js_1.projectTaskStatusEnum; } });
Object.defineProperty(exports, "v2ReviewStatusEnum", { enumerable: true, get: function () { return enums_js_1.v2ReviewStatusEnum; } });
//# sourceMappingURL=cloud-baseline.js.map
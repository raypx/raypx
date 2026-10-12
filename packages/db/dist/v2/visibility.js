"use strict";
var __makeTemplateObject = (this && this.__makeTemplateObject) || function (cooked, raw) {
    if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
    return cooked;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.projectVisibility = projectVisibility;
exports.resourceVisibility = resourceVisibility;
var drizzle_orm_1 = require("drizzle-orm");
var schema_js_1 = require("../schema.js");
/** Read visibility mirrors resolveProjectAccessV2; parity is tested against Core. */
function projectVisibility(actorId) {
    var member = (0, drizzle_orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["select 1 from ", " where ", " = ", " and ", " = ", ""], ["select 1 from ", " where ", " = ", " and ", " = ", ""])), schema_js_1.v2ProjectMembers, schema_js_1.v2ProjectMembers.projectId, schema_js_1.v2Projects.id, schema_js_1.v2ProjectMembers.userId, actorId);
    return (0, drizzle_orm_1.sql)(templateObject_2 || (templateObject_2 = __makeTemplateObject(["(\n    ", " = ", "\n    or (", " is not null and exists (", " and ", " = 'active'))\n    or (", " is not null\n      and exists (select 1 from ", " where ", " = ", " and ", " = ", " and ", " = 'active')\n      and not exists (", " and ", " = 'removed'))\n  )"], ["(\n    ", " = ", "\n    or (", " is not null and exists (", " and ", " = 'active'))\n    or (", " is not null\n      and exists (select 1 from ", " where ", " = ", " and ", " = ", " and ", " = 'active')\n      and not exists (", " and ", " = 'removed'))\n  )"])), schema_js_1.v2Projects.personalOwnerId, actorId, schema_js_1.v2Projects.personalOwnerId, member, schema_js_1.v2ProjectMembers.status, schema_js_1.v2Projects.organizationId, schema_js_1.organizationMembers, schema_js_1.organizationMembers.organizationId, schema_js_1.v2Projects.organizationId, schema_js_1.organizationMembers.userId, actorId, schema_js_1.organizationMembers.status, member, schema_js_1.v2ProjectMembers.status);
}
function resourceVisibility(actorId, projectId) {
    return (0, drizzle_orm_1.sql)(templateObject_3 || (templateObject_3 = __makeTemplateObject(["exists (select 1 from ", " where ", " = ", " and ", ")"], ["exists (select 1 from ", " where ", " = ", " and ", ")"])), schema_js_1.v2Projects, schema_js_1.v2Projects.id, projectId, projectVisibility(actorId));
}
var templateObject_1, templateObject_2, templateObject_3;
//# sourceMappingURL=visibility.js.map
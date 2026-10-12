"use strict";
var __makeTemplateObject = (this && this.__makeTemplateObject) || function (cooked, raw) {
    if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
    return cooked;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.timestampKey = timestampKey;
exports.cursorPage = cursorPage;
var core_1 = require("@voidmix/core");
var drizzle_orm_1 = require("drizzle-orm");
function timestampKey(column) {
    return (0, drizzle_orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["date_trunc('milliseconds', ", ")"], ["date_trunc('milliseconds', ", ")"])), column);
}
function cursorPage(query, scope) {
    var _a;
    var limit = (_a = query.limit) !== null && _a !== void 0 ? _a : (query.cursor ? 50 : undefined);
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 100))
        throw new core_1.DomainError("BAD_REQUEST", "Invalid page size.");
    var after;
    if (query.cursor !== undefined) {
        try {
            if (!/^[A-Za-z0-9_-]+$/.test(query.cursor))
                throw new Error();
            var _b = JSON.parse(Buffer.from(query.cursor, "base64url").toString("utf8")), version = _b[0], savedScope = _b[1], time = _b[2], id = _b[3];
            if (version !== 1 ||
                savedScope !== scope ||
                typeof time !== "string" ||
                typeof id !== "string" ||
                !id ||
                !Number.isFinite(Date.parse(time)))
                throw new Error();
            after = { time: new Date(time), id: id };
        }
        catch (_c) {
            throw new core_1.DomainError("BAD_REQUEST", "Invalid pagination cursor.");
        }
    }
    return {
        limit: limit,
        seek: function (time, id) {
            return after
                ? (0, drizzle_orm_1.sql)(templateObject_2 || (templateObject_2 = __makeTemplateObject(["(", ", ", ") < (", "::timestamptz, ", ")"], ["(", ", ", ") < (", "::timestamptz, ", ")"])), time, id, after.time.toISOString(), after.id) : undefined;
        },
        finish: function (rows, time) {
            var items = limit === undefined ? rows : rows.slice(0, limit);
            var last = items.at(-1);
            var nextCursor = limit !== undefined && rows.length > limit && last
                ? Buffer.from(JSON.stringify([1, scope, time(last).toISOString(), last.id])).toString("base64url")
                : null;
            return { items: items, nextCursor: nextCursor };
        },
    };
}
var templateObject_1, templateObject_2;
//# sourceMappingURL=pagination.js.map
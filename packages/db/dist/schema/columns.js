"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requiredReference = exports.timestamps = exports.updatedAt = exports.createdAt = exports.dateColumn = void 0;
var pg_core_1 = require("drizzle-orm/pg-core");
var dateColumn = function (name) { return (0, pg_core_1.timestamp)(name, { withTimezone: true, mode: "date" }); };
exports.dateColumn = dateColumn;
var createdAt = function () { return (0, exports.dateColumn)("created_at").notNull().defaultNow(); };
exports.createdAt = createdAt;
var updatedAt = function () {
    return (0, exports.dateColumn)("updated_at")
        .notNull()
        .defaultNow()
        .$onUpdate(function () { return new Date(); });
};
exports.updatedAt = updatedAt;
var timestamps = function () { return ({ createdAt: (0, exports.createdAt)(), updatedAt: (0, exports.updatedAt)() }); };
exports.timestamps = timestamps;
var requiredReference = function (name, reference, onDelete) { return (0, pg_core_1.text)(name).notNull().references(reference, { onDelete: onDelete }); };
exports.requiredReference = requiredReference;
//# sourceMappingURL=columns.js.map
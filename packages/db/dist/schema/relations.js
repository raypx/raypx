"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.relations = void 0;
var drizzle_orm_1 = require("drizzle-orm");
var tables_js_1 = require("./tables.js");
// Repository adapters use explicit joins. Better Auth alone uses relational queries.
exports.relations = (0, drizzle_orm_1.defineRelations)(tables_js_1.schema, function (r) { return ({
    users: {
        authSessions: r.many.authSessions({ from: r.users.id, to: r.authSessions.userId }),
        authAccounts: r.many.authAccounts({ from: r.users.id, to: r.authAccounts.userId }),
    },
    authSessions: {
        user: r.one.users({ from: r.authSessions.userId, to: r.users.id, optional: false }),
    },
    authAccounts: {
        user: r.one.users({ from: r.authAccounts.userId, to: r.users.id, optional: false }),
    },
}); });
//# sourceMappingURL=relations.js.map
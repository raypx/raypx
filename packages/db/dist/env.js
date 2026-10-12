"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.databaseEnv = void 0;
exports.getDatabaseEnv = getDatabaseEnv;
var env_1 = require("@voidmix/shared/env");
var runtime_1 = require("@voidmix/shared/env/runtime");
exports.databaseEnv = {
    id: "database",
    server: {
        DATABASE_URL: env_1.z.url(),
    },
};
function getDatabaseEnv() {
    return (0, env_1.createEnv)({ extends: [runtime_1.runtimeEnv, exports.databaseEnv] });
}
//# sourceMappingURL=env.js.map
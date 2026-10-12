"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.schema = void 0;
var cloud = require("./cloud.js");
var identity = require("./identity.js");
var projects = require("./projects.js");
var resources_js_1 = require("./resources.js");
/** The runtime graph matches the fresh baseline; retired tables stay in historical modules. */
exports.schema = __assign(__assign(__assign(__assign({}, identity), projects), cloud), { v2Assets: resources_js_1.v2Assets, v2AssetVersions: resources_js_1.v2AssetVersions, v2Reviews: resources_js_1.v2Reviews, v2Feedback: resources_js_1.v2Feedback, v2Activities: resources_js_1.v2Activities, outboxEvents: resources_js_1.outboxEvents });
//# sourceMappingURL=tables.js.map
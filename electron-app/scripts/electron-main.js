// @ts-check
const path = require("path");
const { app } = require("electron");

// in dev the plugins get passed via `theia start --plugins=local-dir:plugins`,
// the packaged app has to tell the backend where they are bundled.
// must be set before the backend gets forked.
if (app.isPackaged && !process.env.THEIA_DEFAULT_PLUGINS) {
    process.env.THEIA_DEFAULT_PLUGINS = `local-dir:${path.resolve(__dirname, "..", "plugins")}`;
}

require("../lib/backend/electron-main.js");

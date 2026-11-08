// @ts-check
// requires a `npm run bundle` beforehand, see `npm run package`
const path = require("path");

/** @type {import('electron-builder').Configuration} */
module.exports = {
    appId: "io.github.capital-g.sc-ide-theia",
    productName: "SuperCollider IDE",
    // the icon is owned by the extension, so resolve it as a dependency.
    // electron-builder can not use svg - rendered via
    // `rsvg-convert -w 1024 supercollider.svg -o supercollider.png`
    icon: require.resolve("SuperColliderIDE/resources/supercollider.png"),
    // reuse the installed electron instead of downloading it again
    electronDist: path.join(
        path.dirname(require.resolve("electron/package.json")),
        "dist",
    ),
    directories: {
        output: "dist",
    },
    // the theia build bundles all js and native modules into lib/,
    // so neither node_modules nor a native rebuild is necessary
    files: [
        "lib/**/*",
        "plugins/**/*",
        "scripts/**/*",
        "package.json",
        "!**/node_modules/**",
    ],
    npmRebuild: false,
    // native modules and binaries (e.g. ripgrep) can not be loaded from an asar
    asar: false,
    mac: {
        category: "public.app-category.music",
    },
    linux: {
        category: "AudioVideo;Audio;Development",
    },
};

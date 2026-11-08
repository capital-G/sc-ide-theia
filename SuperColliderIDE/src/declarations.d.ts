declare module "*.css";

// inlined as data url by the esbuild `dataurl` loader of the apps
declare module "*.svg" {
    const dataUrl: string;
    export default dataUrl;
}

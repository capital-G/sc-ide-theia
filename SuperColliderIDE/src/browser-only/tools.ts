/**
 * some ai magic...
 *
 * esbuild's IIFE output rewrites a non-analyzable `import()` into its own `__require`
 * shim, which throws "Dynamic require of ... is not supported". Constructing the import
 * through `new Function` hides it from the bundler entirely, and the browser then performs
 * a real dynamic import. The specifier is absolute, so it resolves against the document.
 */
export function importGlue<T>(url: string): Promise<{ default: T }> {
    return new Function("u", "return import(u)")(url);
}

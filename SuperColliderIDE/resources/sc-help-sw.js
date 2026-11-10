// Service worker of the wasm build which serves /sc-help/ for the help browser.
// The help files live in sclang's MEMFS which is owned by the IDE window, so
// every request gets forwarded to it (see src/browser-only/sc-help-sw-bridge.ts),
// which lets sclang render the page on demand.

const ROUTE = "/sc-help/";
// rendering the first page indexes all help files
const TIMEOUT_MS = 90000;
// the IDE runs w/ COEP require-corp, so framed documents need it as well
const HEADERS = {
    "Cross-Origin-Embedder-Policy": "require-corp",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Cache-Control": "no-cache",
};

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
    event.waitUntil(self.clients.claim()),
);

self.addEventListener("fetch", (event) => {
    const url = new URL(event.request.url);
    if (
        event.request.method !== "GET" ||
        url.origin !== self.location.origin ||
        !url.pathname.startsWith(ROUTE)
    ) {
        return;
    }
    event.respondWith(serve(url));
});

/** the IDE window - the help frames are window clients as well */
async function ideClient() {
    const all = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
    });
    const ides = all.filter((c) => !new URL(c.url).pathname.startsWith(ROUTE));
    return (
        ides.find((c) => c.focused) ??
        ides.find((c) => c.visibilityState === "visible") ??
        ides[0]
    );
}

function errorResponse(status, message) {
    return new Response(
        `<!doctype html><meta charset="utf-8"><p style="font-family:sans-serif;color:#888">${message}</p>`,
        {
            status,
            headers: { ...HEADERS, "Content-Type": "text/html; charset=utf-8" },
        },
    );
}

async function serve(url) {
    const client = await ideClient();
    if (!client) {
        return errorResponse(503, "The IDE is not running.");
    }
    const reply = await new Promise((resolve) => {
        const channel = new MessageChannel();
        const timer = setTimeout(() => resolve(undefined), TIMEOUT_MS);
        channel.port1.onmessage = (event) => {
            clearTimeout(timer);
            resolve(event.data);
        };
        client.postMessage({ type: "sc-help-request", path: url.pathname }, [
            channel.port2,
        ]);
    });
    if (!reply) {
        return errorResponse(504, "The interpreter did not respond in time.");
    }
    if (reply.location) {
        return Response.redirect(new URL(reply.location, url).href, 302);
    }
    return new Response(reply.body, {
        status: reply.status,
        headers: { ...HEADERS, "Content-Type": reply.contentType },
    });
}

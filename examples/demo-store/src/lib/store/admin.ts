// Who may change the store (scenario, fix, reset) and read the order list.
// Locally the admin is open, so the eval, the tests, and `npm run dev` need no key.
// On Cloudflare (the public demo) every visitor shares one store: admin calls need STORE_ADMIN_KEY,
// and with no key set they are refused, so a visitor cannot break the demo for a judge.

const onWorkers = () => globalThis.navigator?.userAgent === "Cloudflare-Workers";

export function adminKey(): string | undefined {
  return process.env.STORE_ADMIN_KEY || undefined;
}

export function adminLocked(): boolean {
  return onWorkers() || !!adminKey();
}

// The key from an x-admin-key header or "Authorization: Bearer <key>".
export function adminAllowed(key: string | null | undefined): boolean {
  if (!adminLocked()) return true;
  const want = adminKey();
  return !!want && !!key && key === want;
}

// null when the request may continue, else the 403 answer.
export function adminDenied(req: Request): Response | null {
  const key = req.headers.get("x-admin-key") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (adminAllowed(key)) return null;
  return Response.json(
    { error: adminKey() ? "Send the store admin key in an x-admin-key header." : "The admin is off on the public demo store. Run the store on your computer to switch scenarios: examples/demo-store/README.md." },
    { status: 403 },
  );
}

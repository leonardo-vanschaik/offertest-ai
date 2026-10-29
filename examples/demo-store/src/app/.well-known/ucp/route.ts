// UCP business profile: tells AI shopping agents where this store's agent checkout lives.
// https://ucp.dev  Shopify stores publish the same document at /.well-known/ucp.
const VERSION = "2026-08-25";

export function GET(req: Request) {
  const origin = new URL(req.url).origin;
  return Response.json({
    ucp: {
      version: VERSION,
      services: {
        "dev.ucp.shopping": [{ version: VERSION, transport: "mcp", endpoint: `${origin}/api/ucp/mcp` }],
      },
      capabilities: {
        "dev.ucp.shopping.catalog.search": [{ version: VERSION }],
        "dev.ucp.shopping.cart": [{ version: VERSION }],
        "dev.ucp.shopping.discount": [{ version: VERSION, extends: ["dev.ucp.shopping.cart"] }],
      },
    },
  });
}

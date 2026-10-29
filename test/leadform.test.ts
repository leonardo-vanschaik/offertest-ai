import { test } from "node:test";
import assert from "node:assert/strict";
import { getLeadForm } from "../src/meta/ads.ts";
import { leadFormText } from "../src/core/run.ts";

process.env.META_ACCESS_TOKEN = "user-token";

function fakeGraph(handler: (path: string, token: string) => object | undefined) {
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL) => {
    const url = new URL(String(input));
    const body = handler(url.pathname.split("/").pop() ?? "", url.searchParams.get("access_token") ?? "");
    return new Response(JSON.stringify(body ?? { error: { message: "(#200) Requires pages_manage_ads permission", code: 200 } }), {
      status: body ? 200 : 400,
    });
  }) as typeof fetch;
  return () => void (globalThis.fetch = real);
}

test("lead form falls back to the Page token", async () => {
  const restore = fakeGraph((path, tok) => {
    if (path === "page1") return { access_token: "page-token" };
    if (path === "form1" && tok === "page-token") return { id: "form1", name: "Free guide", questions: [{ key: "email", type: "EMAIL" }] };
  });
  try {
    const form = await getLeadForm("form1", "page1");
    assert.equal(form?.readError, undefined);
    assert.equal(form?.name, "Free guide");
  } finally {
    restore();
  }
});

test("lead form error keeps the first error when the Page token also fails", async () => {
  const restore = fakeGraph(() => undefined);
  try {
    const form = await getLeadForm("form1", "page1");
    assert.match(form?.readError ?? "", /pages_manage_ads/);
    assert.match(leadFormText("form1", form), /pages_read_engagement/);
  } finally {
    restore();
  }
});

test("permission advice only for permission errors", () => {
  const text = leadFormText("form1", { id: "form1", questions: [], readError: "Meta Graph API: Unsupported get request. Object does not exist." });
  assert.doesNotMatch(text, /pages_/);
});

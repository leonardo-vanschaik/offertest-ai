import { test } from "node:test";
import assert from "node:assert/strict";
import { adContent } from "../src/core/assertions.ts";
import { landingUrl, toAd } from "../src/meta/ads.ts";

test("link ad: copy, CTA, destination with url_tags filled", async () => {
  const ad = await toAd({
    id: "120001",
    name: "Ridge SAVE20",
    effective_status: "PAUSED",
    campaign_id: "9",
    creative: {
      id: "c1",
      url_tags: "utm_source=facebook&utm_content={{ad.id}}&utm_campaign={{campaign.id}}",
      object_story_spec: {
        link_data: {
          link: "https://aldertrail.example/products/ridge",
          message: "This week only. Use code SAVE20 at checkout.",
          name: "20% off the Ridge trail shoe.",
          picture: "https://img.example/ridge.jpg",
          call_to_action: { type: "SHOP_NOW", value: { link: "https://aldertrail.example/products/ridge" } },
        },
      },
    },
  });
  assert.equal(ad.source, "meta");
  assert.equal(ad.headline, "20% off the Ridge trail shoe.");
  assert.equal(ad.text, "This week only. Use code SAVE20 at checkout.");
  assert.equal(ad.cta, "Shop now");
  assert.deepEqual(ad.destination, {
    type: "website",
    url: "https://aldertrail.example/products/ridge?utm_source=facebook&utm_content=120001&utm_campaign=9",
  });
});

test("carousel cards keep their own links", async () => {
  const ad = await toAd({
    id: "2",
    creative: {
      id: "c2",
      object_story_spec: {
        link_data: {
          link: "https://shop.example",
          message: "Pick your pack",
          child_attachments: [
            { link: "https://shop.example/a", name: "Daypack $64" },
            { link: "https://shop.example/b", name: "Socks $18" },
          ],
        },
      },
    },
  });
  assert.equal(ad.cards?.length, 2);
  assert.deepEqual(ad.cards?.[1].destination, { type: "website", url: "https://shop.example/b" });
});

test("carousel card images reach the model, labeled with their card, so an offer printed only on a card is read", async () => {
  const main = "data:image/png;base64,TUFJTg==";
  const second = "data:image/png;base64,Q0FSRDE=";
  const ad = await toAd({
    id: "2b",
    creative: {
      id: "c2b",
      object_story_spec: {
        link_data: {
          link: "https://shop.example",
          message: "Pick your pack",
          picture: main,
          child_attachments: [
            { link: "https://shop.example/a", name: "Daypack", picture: main },
            { link: "https://shop.example/b", name: "Socks", picture: second },
          ],
        },
      },
    },
  });
  assert.equal(ad.cards?.[1].imageUrl, second);
  const parts = await adContent(ad);
  const images = parts.flatMap((p) => (p.type === "image_url" ? [p.image_url.url] : []));
  assert.deepEqual(images, [main, second], "the main image once, then card 1's own image");
  assert.ok(parts.some((p) => p.type === "text" && p.text === "Card 1 image:"));
});

test("click-to-WhatsApp ad reads the welcome message", async () => {
  const ad = await toAd({
    id: "3",
    creative: {
      id: "c3",
      object_story_spec: {
        link_data: {
          message: "Free quote in 5 minutes",
          call_to_action: { type: "WHATSAPP_MESSAGE" },
          page_welcome_message: JSON.stringify({ type: "VISUAL_EDITOR", landing_screen_type: "welcome_message", text_format: { message: { text: "Hi! Send us your address for a free quote." } } }),
        },
      },
    },
  });
  assert.equal(ad.destination.type, "messaging");
  assert.match((ad.destination as { welcomeMessage?: string }).welcomeMessage ?? "", /free quote/);
});

test("url_tags append to a URL that already has a query", () => {
  assert.equal(landingUrl("https://x.example/p?a=1", "utm_id={{ad.id}}", { id: "7" }), "https://x.example/p?a=1&utm_id=7");
});

test("carousel card keeps its own link when it inherits the parent CTA", async () => {
  const ad = await toAd({
    id: "4",
    creative: {
      id: "c4",
      object_story_spec: {
        link_data: {
          link: "https://shop.example",
          call_to_action: { type: "SHOP_NOW", value: { link: "https://shop.example/parent" } },
          child_attachments: [
            { link: "https://shop.example/a", name: "A" },
            { link: "https://shop.example/b", name: "B" },
          ],
        },
      },
    },
  });
  assert.deepEqual(ad.cards?.map((c) => (c.destination as { url: string }).url), ["https://shop.example/a", "https://shop.example/b"]);
});

test("account scan follows every page", async () => {
  const { listAdIds } = await import("../src/meta/ads.ts");
  process.env.META_ACCESS_TOKEN = "t";
  const calls: string[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    calls.push(String(url));
    const second = String(url).includes("after=CUR1");
    const ad = (id: string) => ({ id, creative: { id: `c${id}`, title: `Ad ${id}`, link_url: `https://x.example/${id}` } });
    return new Response(JSON.stringify(second ? { data: [ad("3")] } : { data: [ad("1"), ad("2")], paging: { next: "https://graph.facebook.com/next", cursors: { after: "CUR1" } } }));
  }) as typeof fetch;
  try {
    const ads = await listAdIds("act_1");
    assert.deepEqual(ads.map((a) => a.id), ["1", "2", "3"]);
    assert.equal(calls.length, 2);
  } finally {
    globalThis.fetch = real;
  }
});

test("url_tags values are URL-encoded (ad names have spaces)", () => {
  const u = landingUrl("https://x.example/p", "utm_campaign={{ad.name}}&utm_term={{adset.name}}", { id: "9", name: "Ridge 20% & more" });
  const q = new URL(u).searchParams;
  assert.equal(q.get("utm_campaign"), "Ridge 20% & more");
  assert.equal(q.get("utm_term"), "offertest");
});

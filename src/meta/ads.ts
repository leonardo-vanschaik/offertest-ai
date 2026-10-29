import type { Ad, AdCard, Destination, LeadForm } from "../types.ts";
import { loadEnv } from "./client.ts";

// Meta Marketing API (Graph API). Reading your own ad account needs a user or system-user token
// with ads_read; pausing needs ads_management. https://developers.facebook.com/docs/marketing-api
const VERSION = () => process.env.META_GRAPH_VERSION ?? "v24.0";

function token(): string {
  loadEnv();
  const t = process.env.META_ACCESS_TOKEN;
  if (!t) throw new Error("META_ACCESS_TOKEN is not set (a Meta token with ads_read). See `offertest init`.");
  return t;
}

export function accountId(id?: string): string {
  loadEnv();
  const a = id ?? process.env.META_AD_ACCOUNT_ID;
  if (!a) throw new Error("No ad account. Pass --account act_123 or set META_AD_ACCOUNT_ID.");
  return a.startsWith("act_") ? a : `act_${a}`;
}

async function graph<T>(path: string, params: Record<string, string> = {}, method: "GET" | "POST" = "GET"): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${VERSION()}/${path.replace(/^\//, "")}`);
  const body = new URLSearchParams({ ...params, access_token: token() });
  const res =
    method === "GET"
      ? await fetch(`${url}?${body}`)
      : await fetch(url, { method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded" } });
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number } } & T;
  if (!res.ok || json.error) throw new Error(`Meta Graph API ${res.status}: ${json.error?.message ?? res.statusText}`);
  return json;
}

const CREATIVE_FIELDS =
  "creative{id,name,title,body,image_url,thumbnail_url,call_to_action_type,object_type,url_tags,link_url,object_story_spec,asset_feed_spec}";
const AD_FIELDS = `id,name,account_id,effective_status,adset_id,campaign_id,${CREATIVE_FIELDS}`;

type CTA = { type?: string; value?: { link?: string; lead_gen_form_id?: string; app_link?: string; application?: string; link_caption?: string } };
type LinkData = {
  link?: string;
  message?: string;
  name?: string;
  description?: string;
  picture?: string;
  image_url?: string;
  call_to_action?: CTA;
  page_welcome_message?: string;
  child_attachments?: { link?: string; name?: string; description?: string; picture?: string; image_url?: string; call_to_action?: CTA }[];
};
type GraphAd = {
  id: string;
  name?: string;
  account_id?: string;
  effective_status?: string;
  adset_id?: string;
  campaign_id?: string;
  creative?: {
    id: string;
    title?: string;
    body?: string;
    image_url?: string;
    thumbnail_url?: string;
    call_to_action_type?: string;
    url_tags?: string;
    link_url?: string;
    object_story_spec?: {
      link_data?: LinkData;
      template_data?: LinkData;
      video_data?: { message?: string; title?: string; link_description?: string; image_url?: string; call_to_action?: CTA };
      photo_data?: { caption?: string; image_url?: string; url?: string };
    };
    asset_feed_spec?: {
      bodies?: { text: string }[];
      titles?: { text: string }[];
      descriptions?: { text: string }[];
      link_urls?: { website_url?: string; display_url?: string }[];
      call_to_action_types?: string[];
    };
  };
};

export async function getAd(adId: string): Promise<Ad> {
  return await toAd(await graph<GraphAd>(adId, { fields: AD_FIELDS }));
}

// Ads about to launch by default: paused or still in review.
export async function listAds(account?: string, statuses = ["PAUSED", "PENDING_REVIEW", "IN_PROCESS", "WITH_ISSUES"]): Promise<Ad[]> {
  const res = await graph<{ data: GraphAd[] }>(`${accountId(account)}/ads`, {
    fields: AD_FIELDS,
    effective_status: JSON.stringify(statuses),
    limit: "50",
  });
  return Promise.all(res.data.map(toAd));
}

export async function pauseAd(adId: string): Promise<void> {
  await graph(adId, { status: "PAUSED" }, "POST");
}

export async function getLeadForm(formId: string): Promise<LeadForm | undefined> {
  try {
    const f = await graph<{
      id: string;
      name?: string;
      questions?: { key?: string; label?: string; type?: string }[];
      context_card?: { title?: string; content?: string[] };
      thank_you_page?: { title?: string; body?: string; button_text?: string; website_url?: string };
      privacy_policy?: { url?: string };
      follow_up_action_url?: string;
    }>(formId, { fields: "id,name,questions,context_card,thank_you_page,privacy_policy,follow_up_action_url" });
    return {
      id: f.id,
      name: f.name,
      intro: [f.context_card?.title, ...(f.context_card?.content ?? [])].filter(Boolean).join(" / ") || undefined,
      questions: (f.questions ?? []).map((q) => ({ key: q.key ?? "", label: q.label ?? q.type ?? "", type: q.type ?? "" })),
      thankYou: f.thank_you_page
        ? { title: f.thank_you_page.title, body: f.thank_you_page.body, buttonText: f.thank_you_page.button_text, url: f.thank_you_page.website_url ?? f.follow_up_action_url }
        : f.follow_up_action_url
          ? { url: f.follow_up_action_url }
          : undefined,
      privacyUrl: f.privacy_policy?.url,
    };
  } catch {
    return undefined;
  }
}

// Meta adds url_tags to the landing URL and fills dynamic parameters like {{ad.id}}.
export function landingUrl(link: string, urlTags: string | undefined, ad: GraphAd): string {
  if (!urlTags) return link;
  const filled = urlTags.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k: string) =>
    ({ "ad.id": ad.id, "ad.name": ad.name ?? "", "adset.id": ad.adset_id ?? "", "campaign.id": ad.campaign_id ?? "", site_source_name: "fb", placement: "Facebook_Mobile_Feed" })[k] ??
    "offertest",
  );
  return link + (link.includes("?") ? "&" : "?") + filled;
}

async function destinationOf(cta: CTA | undefined, link: string | undefined, ld: LinkData | undefined, g: GraphAd): Promise<Destination> {
  const type = (cta?.type ?? g.creative?.call_to_action_type ?? "").toUpperCase();
  const formId = cta?.value?.lead_gen_form_id;
  if (formId) return { type: "lead_form", formId, form: await getLeadForm(formId) };
  if (/WHATSAPP/.test(type)) return { type: "messaging", channel: "whatsapp", welcomeMessage: welcome(ld?.page_welcome_message) };
  if (/INSTAGRAM_MESSAGE/.test(type)) return { type: "messaging", channel: "instagram", welcomeMessage: welcome(ld?.page_welcome_message) };
  if (/MESSAGE_PAGE|SEND_MESSAGE|MESSENGER/.test(type)) return { type: "messaging", channel: "messenger", welcomeMessage: welcome(ld?.page_welcome_message) };
  if (/CALL_NOW|CALL\b/.test(type)) return { type: "call", phone: (cta?.value?.link ?? link ?? "").replace(/^tel:/, "") };
  const url = cta?.value?.link ?? link;
  if (/INSTALL|USE_APP|PLAY_GAME/.test(type) && url) return { type: "app", url };
  if (url && /^https?:/.test(url)) return { type: "website", url: landingUrl(url, g.creative?.url_tags, g) };
  return { type: "unknown", note: `CTA ${type || "none"}, no link found` };
}

// page_welcome_message is a JSON string; pull the readable text out of it.
function welcome(raw?: string): string | undefined {
  if (!raw) return undefined;
  try {
    const texts: string[] = [];
    JSON.stringify(JSON.parse(raw), (k, v) => {
      if ((k === "text" || k === "message" || k === "title") && typeof v === "string") texts.push(v);
      return v;
    });
    return texts.join("\n") || raw;
  } catch {
    return raw;
  }
}

export async function toAd(g: GraphAd): Promise<Ad> {
  const c = g.creative ?? { id: "" };
  const oss = c.object_story_spec ?? {};
  const ld = oss.link_data ?? oss.template_data;
  const vd = oss.video_data;
  const afs = c.asset_feed_spec;
  const cta = ld?.call_to_action ?? vd?.call_to_action;
  const destination = await destinationOf(cta, ld?.link ?? afs?.link_urls?.[0]?.website_url ?? c.link_url, ld, g);

  const cards: AdCard[] = [];
  for (const ch of ld?.child_attachments ?? [])
    cards.push({ headline: ch.name ?? "", text: ch.description, destination: await destinationOf(ch.call_to_action ?? cta, ch.link, ld, g) });
  // Dynamic creative: every extra title/body combination is a variant the customer may see.
  for (const u of afs?.link_urls?.slice(1) ?? [])
    if (u.website_url) cards.push({ headline: "", destination: { type: "website", url: landingUrl(u.website_url, c.url_tags, g) } });
  for (const t of afs?.titles?.slice(1) ?? []) cards.push({ headline: t.text, destination });
  for (const b of afs?.bodies?.slice(1) ?? []) cards.push({ headline: "", text: b.text, destination });

  return {
    source: "meta",
    id: g.id,
    name: g.name,
    accountId: g.account_id,
    status: g.effective_status,
    headline: ld?.name ?? vd?.title ?? c.title ?? afs?.titles?.[0]?.text ?? g.name ?? "",
    text: ld?.message ?? vd?.message ?? oss.photo_data?.caption ?? c.body ?? afs?.bodies?.[0]?.text ?? "",
    description: ld?.description ?? vd?.link_description ?? afs?.descriptions?.[0]?.text,
    cta: humanCta(cta?.type ?? c.call_to_action_type ?? afs?.call_to_action_types?.[0]),
    imageUrl: c.image_url ?? ld?.picture ?? ld?.image_url ?? vd?.image_url ?? oss.photo_data?.image_url ?? c.thumbnail_url,
    destination,
    ...(cards.length ? { cards } : {}),
  };
}

function humanCta(t?: string): string {
  if (!t) return "Learn more";
  return t
    .toLowerCase()
    .split("_")
    .map((w, i) => (i === 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

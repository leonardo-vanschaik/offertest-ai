import type { Ad, AdCard, Destination, LeadForm } from "../types.ts";
import { loadEnv } from "./client.ts";

// Meta Marketing API (Graph API). Reading your own ad account needs a user or system-user token
// with ads_read; pausing needs ads_management. https://developers.facebook.com/docs/marketing-api
const VERSION = () => process.env.META_GRAPH_VERSION ?? "v24.0";

function token(): string {
  loadEnv();
  const t = process.env.META_ACCESS_TOKEN;
  if (!t) throw new Error("Ads Manager is not connected. Run `offertest init` (step 2 connects Ads Manager in about 3 minutes).");
  return t;
}

export function accountId(id?: string): string {
  loadEnv();
  const a = id ?? process.env.META_AD_ACCOUNT_ID;
  if (!a) throw new Error("No ad account. Pass --account act_123 or set META_AD_ACCOUNT_ID.");
  return a.startsWith("act_") ? a : `act_${a}`;
}

async function graph<T>(path: string, params: Record<string, string> = {}, method: "GET" | "POST" = "GET", tok?: string): Promise<T> {
  const url = new URL(`${process.env.META_GRAPH_URL ?? "https://graph.facebook.com"}/${VERSION()}/${path.replace(/^\//, "")}`);
  const body = new URLSearchParams({ ...params, access_token: tok ?? token() });
  const res =
    method === "GET"
      ? await fetch(`${url}?${body}`)
      : await fetch(url, { method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded" } });
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number } } & T;
  if (!res.ok || json.error) {
    const msg = json.error?.message ?? res.statusText;
    const hint =
      json.error?.code === 190
        ? " Your Ads Manager token expired or was revoked: run `offertest init` to connect again."
        : json.error?.code === 200 || json.error?.code === 10
          ? " The token lacks a permission (ads_read, or ads_management to pause): run `offertest doctor`."
          : "";
    throw new Error(`Meta Graph API: ${msg}.${hint}`);
  }
  return json;
}

const CREATIVE_FIELDS =
  "creative{id,name,title,body,image_url,thumbnail_url,call_to_action_type,object_type,object_story_id,url_tags,link_url,object_story_spec,asset_feed_spec}";
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
    object_story_id?: string;
    object_story_spec?: {
      page_id?: string;
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

// Ads about to launch by default: paused, held by a paused campaign or ad set, or still in review.
export const PRELAUNCH = ["PAUSED", "CAMPAIGN_PAUSED", "ADSET_PAUSED", "PENDING_REVIEW", "IN_PROCESS", "WITH_ISSUES"];

export type AdSummary = { id: string; name?: string; status?: string };

// Lists ad ids only (cheap; Meta rejects big creative payloads for 50 ads at once). Follows every page.
export async function listAdIds(account?: string, statuses = PRELAUNCH): Promise<AdSummary[]> {
  const params = { fields: "id,name,effective_status", effective_status: JSON.stringify(statuses), limit: "100" };
  type Page = { data: { id: string; name?: string; effective_status?: string }[]; paging?: { next?: string; cursors?: { after?: string } } };
  let page = await graph<Page>(`${accountId(account)}/ads`, params);
  const all = [...page.data];
  while (page.paging?.next && page.paging.cursors?.after) {
    page = await graph<Page>(`${accountId(account)}/ads`, { ...params, after: page.paging.cursors.after });
    all.push(...page.data);
  }
  return all.map((a) => ({ id: a.id, name: a.name, status: a.effective_status }));
}

export async function listAds(account?: string, statuses = PRELAUNCH): Promise<Ad[]> {
  const ids = await listAdIds(account, statuses);
  const out: Ad[] = [];
  for (const a of ids) out.push(await getAd(a.id));
  return out;
}

export async function pauseAd(adId: string): Promise<void> {
  await graph(adId, { status: "PAUSED" }, "POST");
}

// Meta often serves lead forms only to a Page access token. Try the user token first, then the
// Page token (needs pages_show_list, pages_read_engagement, pages_manage_ads on the user token).
export async function getLeadForm(formId: string, pageId?: string): Promise<LeadForm | undefined> {
  try {
    return await readLeadForm(formId);
  } catch (e) {
    if (pageId) {
      try {
        const page = await graph<{ access_token?: string }>(pageId, { fields: "access_token" });
        if (page.access_token) return await readLeadForm(formId, page.access_token);
      } catch {
        // fall through and report the first error
      }
    }
    return { id: formId, questions: [], readError: (e as Error).message };
  }
}

async function readLeadForm(formId: string, tok?: string): Promise<LeadForm> {
    const f = await graph<{
      id: string;
      name?: string;
      questions?: { key?: string; label?: string; type?: string }[];
      context_card?: { title?: string; content?: string[] };
      thank_you_page?: { title?: string; body?: string; button_text?: string; website_url?: string };
      privacy_policy?: { url?: string };
      follow_up_action_url?: string;
    }>(formId, { fields: "id,name,questions,context_card,thank_you_page,privacy_policy,follow_up_action_url" }, "GET", tok);
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
}

// Meta adds url_tags to the landing URL and fills dynamic parameters like {{ad.id}}.
export function landingUrl(link: string, urlTags: string | undefined, ad: GraphAd): string {
  if (!urlTags) return link;
  const values: Record<string, string> = {
    "ad.id": ad.id,
    "ad.name": ad.name ?? "",
    "adset.id": ad.adset_id ?? "",
    "campaign.id": ad.campaign_id ?? "",
    site_source_name: "fb",
    placement: "Facebook_Mobile_Feed",
  };
  const filled = urlTags.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k: string) => encodeURIComponent(values[k] ?? "offertest"));
  const url = new URL(link);
  for (const [k, v] of new URLSearchParams(filled)) url.searchParams.set(k, v); // url_tags win over duplicates
  return url.toString();
}

async function destinationOf(cta: CTA | undefined, link: string | undefined, ld: LinkData | undefined, g: GraphAd): Promise<Destination> {
  const type = (cta?.type ?? g.creative?.call_to_action_type ?? "").toUpperCase();
  const formId = cta?.value?.lead_gen_form_id;
  if (formId) return { type: "lead_form", formId, form: await getLeadForm(formId, g.creative?.object_story_spec?.page_id) };
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
  let link = ld?.link ?? afs?.link_urls?.[0]?.website_url ?? oss.photo_data?.url ?? c.link_url;
  let postText: string | undefined;
  // "Use existing post" and boosted posts keep the link and text on the Page post, not in the creative.
  if (!link && !cta?.value?.link && c.object_story_id) {
    const post = await graph<{ message?: string; call_to_action?: CTA; attachments?: { data?: { unshimmed_url?: string; url?: string; title?: string }[] } }>(c.object_story_id, {
      fields: "message,call_to_action,attachments{unshimmed_url,url,title}",
    }).catch(() => undefined);
    link = post?.call_to_action?.value?.link ?? post?.attachments?.data?.[0]?.unshimmed_url ?? post?.attachments?.data?.[0]?.url;
    postText = post?.message;
  }
  const destination = await destinationOf(cta, link, ld, g);

  const cards: AdCard[] = [];
  // A card keeps its own link; it inherits only the parent's CTA type, never the parent's link.
  for (const ch of ld?.child_attachments ?? [])
    cards.push({
      headline: ch.name ?? "",
      text: ch.description,
      destination: await destinationOf(ch.call_to_action ?? (cta?.type ? { type: cta.type } : undefined), ch.link ?? ld?.link, ld, g),
    });
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
    text: ld?.message ?? vd?.message ?? oss.photo_data?.caption ?? c.body ?? afs?.bodies?.[0]?.text ?? postText ?? "",
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

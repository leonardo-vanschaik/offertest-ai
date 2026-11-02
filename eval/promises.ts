// Promise reading, scored. Muse Spark (Meta Model API) and Muse Spark Open (open weights, through OpenRouter on
// Baseten, Fireworks, or Modal) read the same 11 ads from the eval set. No store or browser needed.
// Labels were written before any scored run. Needs META_API_KEY and OPENROUTER_API_KEY.
//   npx tsx eval/promises.ts [--models spark,spark-open]
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { extractAssertions } from "../src/core/assertions.ts";
import { MODELS } from "../src/meta/client.ts";
import { adText, containsQuote } from "../src/core/quotes.ts";
import type { OpenWeights, RunResult } from "../src/types.ts";
import { CASES } from "./cases.ts";
import { found, type Expected } from "./score.ts";

type Model = "spark" | "spark-open";

// Keyed by ad headline. Fixed before the first scored run. After a review, the scorer stopped reading the ad
// quote, and the no-credit-card label must now be stated as absent (negated). Both models were scored again
// with these stricter rules. Do not edit after a scored run.
const LABELS: Record<string, Expected[]> = {
  "20% off the Ridge trail shoe.": [{ kinds: ["discount"], terms: ["save20", "20"] }],
  "Take 20% off the Ridge trail shoe.": [{ kinds: ["discount"], terms: ["save20", "20"] }],
  "The Ridge trail shoe. $120.": [{ kinds: ["price"], terms: ["120"] }, { kinds: ["free_shipping"], terms: [] }],
  "Meet the Ridge: $120, shipped free.": [{ kinds: ["price"], terms: ["120"] }, { kinds: ["free_shipping"], terms: [] }],
  "Free shipping on every order.": [{ kinds: ["free_shipping"], terms: [] }],
  "Free shipping on orders over $50.": [{ kinds: ["free_shipping"], terms: ["50"] }],
  "The Ridge in Slate, every size from 7 to 12, in stock now.": [{ kinds: ["availability"], terms: ["7", "12"] }],
  "Every size in stock.": [{ kinds: ["availability"], terms: ["7", "12"] }],
  "$10 off the Summit rain jacket with code TRAIL10.": [{ kinds: ["discount"], terms: ["trail10", "10"] }],
  "Try Trail Club free for 30 days.": [{ kinds: ["free_trial"], terms: ["30"] }, { kinds: ["free_trial", "other"], terms: ["credit card"], negated: true }],
  "Free: The First Thru-Hike Guide": [{ kinds: ["lead_magnet"], terms: ["guide"] }],
};

const { values } = parseArgs({ options: { models: { type: "string", default: "spark,spark-open" } } });
const models = values.models!.split(",") as Model[];
const OUT = path.join(import.meta.dirname, "results", "promises.json");


function blank(ad: (typeof CASES)[number]): RunResult {
  return {
    schemaVersion: 1,
    tool: { name: "offertest", version: "eval" },
    id: "eval-promises",
    createdAt: new Date().toISOString(),
    ad: { source: "manual", ...ad.ad, destination: { type: "website", url: ad.landingUrl } },
    assertions: [],
    steps: [],
    verdicts: [],
    boundary: "Not tested",
    models: {},
    usage: { inputTokens: 0, outputTokens: 0, images: 0, usd: 0 },
  };
}

async function main() {
  const ads = [...new Map(CASES.map((c) => [c.ad.headline, c])).values()];
  const missing = ads.filter((c) => !LABELS[c.ad.headline]);
  if (missing.length) throw new Error(`No labels for: ${missing.map((c) => c.ad.headline).join(", ")}`);
  const expected = ads.reduce((n, c) => n + LABELS[c.ad.headline].length, 0);
  const rows: Record<string, unknown>[] = [];
  const summary: Record<string, unknown> = {};
  for (const model of models) {
    let hits = 0, quotes = 0, quotesOk = 0, ms = 0, usd = 0, errors = 0;
    let build: OpenWeights | undefined;
    const providers = new Set<string>();
    const quantizations = new Set<string>();
    let fallbacks = 0;
    for (const c of ads) {
      const r = blank(c);
      const t0 = Date.now();
      try {
        const { assertions } = await extractAssertions(r, { open: model === "spark-open" });
        if (r.openWeights?.fallback) throw new Error(`${r.models["ad to promises"]} read this one instead: ${r.openWeights.fallback}`);
        if (model === "spark" && r.models["ad to promises"] !== MODELS.spark) throw new Error(`${r.models["ad to promises"]} answered instead of ${MODELS.spark}`);
        const labels = LABELS[c.ad.headline];
        const got = labels.filter((e) => found(e, assertions)).length;
        const okQuotes = assertions.filter((a) => containsQuote(adText(r.ad), a.adQuote)).length;
        hits += got;
        quotes += assertions.length;
        quotesOk += okQuotes;
        rows.push({ model, ad: c.ad.headline, found: `${got}/${labels.length}`, quotesWordForWord: `${okQuotes}/${assertions.length}`, assertions });
        console.log(`${got === labels.length ? "✓" : "✗"} ${model}  ${got}/${labels.length} found, ${okQuotes}/${assertions.length} quotes word for word  ${((Date.now() - t0) / 1000).toFixed(0)} s  ${c.ad.headline}`);
      } catch (err) {
        errors++;
        rows.push({ model, ad: c.ad.headline, error: String(err) });
        console.log(`✗ ${model}  error: ${String(err).slice(0, 120)}  ${c.ad.headline}`);
      }
      ms += Date.now() - t0;
      usd += r.usage.usd;
      if (r.openWeights) {
        build = r.openWeights;
        if (r.openWeights.fallback) fallbacks++;
        else {
          providers.add(r.openWeights.provider);
          quantizations.add(r.openWeights.quantization);
        }
      }
    }
    summary[model] = {
      model: build?.model ?? "muse-spark-1.3",
      ...(build ? { route: build.route, providers: [...providers], quantization: [...quantizations], fellBack: fallbacks } : {}),
      promisesFound: `${hits}/${expected}`,
      quotesWordForWord: `${quotesOk}/${quotes}`,
      errors,
      seconds: Math.round(ms / 1000),
      usd: Number(usd.toFixed(4)),
    };
    console.log(`\n${model}: ${hits}/${expected} promises found, ${quotesOk}/${quotes} quotes word for word, ${errors} errors, ${(ms / 1000).toFixed(0)} s, $${usd.toFixed(3)}\n`);
  }
  const prev = fs.existsSync(OUT) ? (JSON.parse(fs.readFileSync(OUT, "utf8")) as { summary: object; rows: { model: string }[] }) : null;
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(
    OUT,
    JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        ads: ads.length,
        expectedPromises: expected,
        summary: { ...prev?.summary, ...summary },
        rows: [...(prev?.rows.filter((r) => !models.includes(r.model as Model)) ?? []), ...rows],
      },
      null,
      2,
    ),
  );
  console.log(`Saved ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

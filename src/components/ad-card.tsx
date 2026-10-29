/* eslint-disable @next/next/no-img-element */
import type { Ad } from "@/lib/types";
import { advertiserName, displayHost } from "./format";
import { IconGlobe, IconImage } from "./icons";

/** Wrap verbatim quotes found in `text` with a highlight. */
export function Highlighted({
  text,
  quotes = [],
  markClass = "rounded-[3px] bg-brand-100/80 px-0.5 text-ink-950 shadow-[inset_0_-2px_0_rgba(11,132,243,0.35)]",
}: {
  text: string;
  quotes?: string[];
  markClass?: string;
}) {
  const qs = quotes.filter((q) => q && text.includes(q)).sort((a, b) => b.length - a.length);
  if (!qs.length) return <>{text}</>;
  const parts: { s: string; hit: boolean }[] = [];
  let rest = text;
  while (rest.length) {
    let best: { i: number; q: string } | null = null;
    for (const q of qs) {
      const i = rest.indexOf(q);
      if (i >= 0 && (!best || i < best.i)) best = { i, q };
    }
    if (!best) {
      parts.push({ s: rest, hit: false });
      break;
    }
    if (best.i > 0) parts.push({ s: rest.slice(0, best.i), hit: false });
    parts.push({ s: best.q, hit: true });
    rest = rest.slice(best.i + best.q.length);
  }
  return (
    <>
      {parts.map((p, i) =>
        p.hit ? (
          <mark key={i} className={markClass}>
            {p.s}
          </mark>
        ) : (
          <span key={i}>{p.s}</span>
        ),
      )}
    </>
  );
}

function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const initials = name
    .replace(/[^A-Za-z ]/g, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#3f5a4a] to-[#24352c] font-semibold text-[#f1e9d8] ring-1 ring-black/5"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials || "AD"}
    </span>
  );
}

function AdImage({ src, className = "" }: { src?: string; className?: string }) {
  if (src) return <img src={src} alt="Ad creative" className={`block h-full w-full object-cover ${className}`} />;
  return (
    <div className={`grid h-full w-full place-items-center bg-surface text-ink-300 ${className}`}>
      <IconImage size={28} />
    </div>
  );
}

/** Phone-feed style ad, like a sponsored post in a social feed. */
export function AdCardFeed({ ad, landingUrl, quotes }: { ad: Ad; landingUrl: string; quotes?: string[] }) {
  const name = advertiserName(landingUrl);
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white text-left">
      <div className="flex items-center gap-2.5 px-3.5 pb-2.5 pt-3">
        <Avatar name={name} />
        <div className="min-w-0 leading-tight">
          <div className="truncate text-[13.5px] font-semibold text-ink-950">{name}</div>
          <div className="flex items-center gap-1 text-[11.5px] text-ink-400">
            Sponsored <span>·</span> <IconGlobe size={11} />
          </div>
        </div>
        <span className="ml-auto text-lg leading-none tracking-widest text-ink-400">···</span>
      </div>
      <p className="px-3.5 pb-3 text-[13.5px] leading-snug text-ink-900">
        {ad.text ? <Highlighted text={ad.text} quotes={quotes} /> : <span className="text-ink-300">Ad text</span>}
      </p>
      <div className="aspect-square w-full border-y border-line bg-surface">
        <AdImage src={ad.imageUrl} />
      </div>
      <div className="flex items-center gap-3 bg-[#f3f4f6] px-3.5 py-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] uppercase tracking-wide text-ink-400">{displayHost(landingUrl) || "your-store.com"}</div>
          <div className="truncate text-[14px] font-semibold leading-snug text-ink-950">
            {ad.headline ? <Highlighted text={ad.headline} quotes={quotes} /> : <span className="text-ink-300">Headline</span>}
          </div>
        </div>
        <span className="shrink-0 rounded-md bg-[#e4e6eb] px-3 py-1.5 text-[13px] font-semibold text-ink-950">
          {ad.cta || "Shop now"}
        </span>
      </div>
    </div>
  );
}

/** Compact horizontal ad card for headers and lists. */
export function AdCardCompact({ ad, landingUrl, quotes }: { ad: Ad; landingUrl: string; quotes?: string[] }) {
  const name = advertiserName(landingUrl);
  return (
    <div className="flex min-w-0 items-stretch gap-3 rounded-xl border border-line bg-white p-2 pr-3">
      <div className="h-[76px] w-[76px] shrink-0 overflow-hidden rounded-lg border border-line bg-surface">
        <AdImage src={ad.imageUrl} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
        <div className="flex items-center gap-1.5 text-[11px] text-ink-400">
          <span className="font-semibold text-ink-700">{name}</span>
          <span>·</span>
          <span>Sponsored</span>
        </div>
        <div className="truncate text-[14px] font-semibold leading-snug text-ink-950">
          <Highlighted text={ad.headline} quotes={quotes} />
        </div>
        <div className="truncate text-[12.5px] leading-snug text-ink-500">
          <Highlighted text={ad.text} quotes={quotes} />
        </div>
      </div>
      <div className="flex shrink-0 items-center">
        <span className="rounded-md bg-surface px-2.5 py-1 text-[12px] font-semibold text-ink-900 ring-1 ring-inset ring-line">
          {ad.cta}
        </span>
      </div>
    </div>
  );
}

/** A generic phone frame (no brand). */
export function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mx-auto w-[340px] rounded-[44px] bg-ink-950 p-[10px] shadow-[var(--shadow-float)]">
      <div className="relative overflow-hidden rounded-[34px] bg-[#f0f2f5]">
        <div className="flex h-11 items-center justify-between px-7 text-[12px] font-semibold text-ink-950">
          <span className="tnum">9:41</span>
          <span className="absolute left-1/2 top-2.5 h-[26px] w-[96px] -translate-x-1/2 rounded-full bg-ink-950" />
          <span className="flex items-center gap-1">
            <svg width="16" height="10" viewBox="0 0 16 10" aria-hidden="true">
              <rect x="0" y="6" width="3" height="4" rx="0.6" fill="currentColor" />
              <rect x="4.3" y="4" width="3" height="6" rx="0.6" fill="currentColor" />
              <rect x="8.6" y="2" width="3" height="8" rx="0.6" fill="currentColor" />
              <rect x="12.9" y="0" width="3" height="10" rx="0.6" fill="currentColor" />
            </svg>
            <svg width="22" height="11" viewBox="0 0 22 11" aria-hidden="true">
              <rect x="0.5" y="0.5" width="18" height="10" rx="2.5" fill="none" stroke="currentColor" opacity="0.4" />
              <rect x="2" y="2" width="14" height="7" rx="1.4" fill="currentColor" />
              <rect x="19.6" y="3.5" width="1.6" height="4" rx="0.8" fill="currentColor" opacity="0.4" />
            </svg>
          </span>
        </div>
        <div className="px-2.5 pb-4">{children}</div>
      </div>
    </div>
  );
}

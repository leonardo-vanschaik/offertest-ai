"use client";

/* eslint-disable @next/next/no-img-element */
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { Ad, NewRunInput } from "@/lib/types";
import { AdCardFeed, PhoneFrame } from "./ad-card";
import { IconArrowRight, IconCard, IconSparkle, IconUpload, IconX } from "./icons";
import { Button, Card } from "./ui";

const SAMPLE: { ad: Ad; landingUrl: string } = {
  ad: {
    headline: "20% off the Ridge trail shoe.",
    text: "This week only. Use code SAVE20 at checkout.",
    cta: "Shop now",
    imageUrl: "/brand/sample-ad.svg",
  },
  landingUrl: "http://localhost:3000/store/products/ridge-trail-shoe",
};

/** Read an image file and return a JPEG data URL, scaled down to keep runs small. */
async function fileToDataUrl(file: File, max = 1080): Promise<string> {
  const raw: string = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
  if (file.type === "image/svg+xml") return raw;
  try {
    const img = new Image();
    img.src = raw;
    await img.decode();
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    if (scale === 1 && file.size < 600_000) return raw;
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    const ctx = c.getContext("2d");
    if (!ctx) return raw;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.88);
  } catch {
    return raw;
  }
}

function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="flex items-baseline justify-between text-[13px] font-medium text-ink-900">
        {label}
        {hint && <span className="text-[12px] font-normal text-ink-400">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-line-strong bg-white px-3 py-2 text-[14px] text-ink-950 shadow-[0_1px_1px_rgba(16,24,40,0.03)] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-ink-300 focus:border-brand-400 focus:ring-4 focus:ring-brand-100";

export function NewRunForm() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [headline, setHeadline] = useState("");
  const [text, setText] = useState("");
  const [cta, setCta] = useState("Shop now");
  const [imageUrl, setImageUrl] = useState<string | undefined>();
  const [landingUrl, setLandingUrl] = useState("");
  const [allowPayment, setAllowPayment] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ad: Ad = { headline, text, cta, imageUrl };
  const canSubmit = headline.trim() && landingUrl.trim() && !busy;

  function loadSample() {
    setHeadline(SAMPLE.ad.headline);
    setText(SAMPLE.ad.text);
    setCta(SAMPLE.ad.cta);
    setImageUrl(SAMPLE.ad.imageUrl);
    setLandingUrl(SAMPLE.landingUrl);
    setAllowPayment(true);
    setError(null);
  }

  async function onFile(f: File | undefined) {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("Choose an image file.");
      return;
    }
    setImageUrl(await fileToDataUrl(f));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    const body: NewRunInput = {
      ad: { headline: headline.trim(), text: text.trim(), cta: cta.trim() || "Shop now", imageUrl },
      landingUrl: landingUrl.trim(),
      allowPayment,
      mode: "agent",
    };
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`The server answered ${res.status}.`);
      const { id } = (await res.json()) as { id: string };
      router.push(`/runs/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the test.");
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
      <Card as="section" className="p-6">
        <form onSubmit={submit} className="flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-ink-950">New test</h2>
              <p className="mt-0.5 text-[13px] text-ink-500">Paste the ad as it will run, and the page it links to.</p>
            </div>
            <Button type="button" variant="secondary" onClick={loadSample}>
              <IconSparkle size={15} className="text-brand-600" />
              Load sample ad
            </Button>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_180px] gap-4">
            <Field label="Ad headline" htmlFor="headline">
              <input
                id="headline"
                className={inputCls}
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                placeholder="20% off the Ridge trail shoe."
              />
            </Field>
            <Field label="Call to action" htmlFor="cta">
              <input id="cta" className={inputCls} value={cta} onChange={(e) => setCta(e.target.value)} placeholder="Shop now" />
            </Field>
          </div>

          <Field label="Ad text" htmlFor="adtext">
            <textarea
              id="adtext"
              rows={2}
              className={`${inputCls} resize-none`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="This week only. Use code SAVE20 at checkout."
            />
          </Field>

          <div className="grid grid-cols-[minmax(0,1fr)_220px] gap-4">
            <Field label="Landing URL" htmlFor="url">
              <input
                id="url"
                className={`${inputCls} font-mono text-[13px]`}
                value={landingUrl}
                onChange={(e) => setLandingUrl(e.target.value)}
                placeholder="https://your-store.com/products/..."
                inputMode="url"
              />
            </Field>
            <Field label="Ad image" hint="Optional">
              <div className="flex items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => onFile(e.target.files?.[0])}
                />
                <Button type="button" variant="secondary" className="flex-1" onClick={() => fileRef.current?.click()}>
                  <IconUpload size={15} />
                  {imageUrl ? "Replace" : "Upload"}
                </Button>
                {imageUrl && (
                  <button
                    type="button"
                    aria-label="Remove image"
                    onClick={() => {
                      setImageUrl(undefined);
                      if (fileRef.current) fileRef.current.value = "";
                    }}
                    className="grid h-9 w-9 place-items-center rounded-lg text-ink-400 ring-1 ring-inset ring-line-strong hover:bg-surface hover:text-ink-900"
                  >
                    <IconX size={14} />
                  </button>
                )}
              </div>
            </Field>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-surface-2 p-3.5 transition-colors hover:border-line-strong">
            <input
              type="checkbox"
              checked={allowPayment}
              onChange={(e) => setAllowPayment(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-brand-600"
            />
            <span className="flex-1">
              <span className="block text-[14px] font-medium text-ink-950">Allow a test-mode purchase (asks before paying)</span>
              <span className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-ink-500">
                <IconCard size={13} /> Test card 4242 only. No real money moves. You approve every payment.
              </span>
            </span>
          </label>

          <div className="flex items-center justify-between gap-4 border-t border-line pt-5">
            <p className="text-[12.5px] text-ink-500">
              The agent shops the page in a fresh browser and shows its proof for every promise.
            </p>
            <Button type="submit" disabled={!canSubmit} className="px-5 py-2.5 text-[14.5px]">
              {busy ? "Starting..." : "Run test"}
              {!busy && <IconArrowRight size={16} />}
            </Button>
          </div>
          {error && (
            <p className="rounded-lg border border-fail-100 bg-fail-50 px-3 py-2 text-[13px] text-fail-700">{error}</p>
          )}
        </form>
      </Card>

      <div className="flex flex-col items-center gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-400">Ad preview</div>
        <PhoneFrame>
          <AdCardFeed ad={ad} landingUrl={landingUrl || "https://your-store.com"} />
        </PhoneFrame>
      </div>
    </div>
  );
}

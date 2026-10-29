import type { Metadata } from "next";
import { connection } from "next/server";
import { getConfig } from "@/lib/store";
import { btnPrimary, card, container, serif } from "../../../_components/ui";

export const metadata: Metadata = { title: "Your guide is ready" };

const PDF_URL = "/guides/first-thru-hike.pdf";
const BROKEN_PDF_URL = "/guides/first-thru-hike-guide.pdf"; // does not exist: 404

export default async function GuideThanksPage() {
  await connection();
  const { guide } = getConfig().funnels;

  return (
    <div className={`${container} max-w-[760px] pt-12`}>
      <h1 className={`${serif} text-[36px] font-semibold leading-tight tracking-tight`} data-testid="guide-status">
        {guide === "paywalled" ? "Your guide is ready. Unlock it for $4.99" : "Your guide is ready."}
      </h1>
      <div className={`${card} mt-8 flex items-center gap-6 p-6`}>
        <PdfIcon />
        <div className="flex-1">
          <p className="text-[18px] font-semibold">The First Thru-Hike Guide</p>
          <p className="mt-1 text-[15px] text-[#5F655F]">PDF from Alder Trail Co.</p>
        </div>
      </div>
      {guide === "paywalled" ? (
        <div className="mt-6">
          <p className="text-[16px] text-[#4A504A]">
            Get lifetime access to the full guide for a one-time payment of $4.99.
          </p>
          <button type="button" data-requires-approval="payment" className={`${btnPrimary} mt-5`}>
            Unlock for $4.99
          </button>
        </div>
      ) : (
        <a href={guide === "broken_link" ? BROKEN_PDF_URL : PDF_URL} className={`${btnPrimary} mt-6`} data-testid="guide-download">
          Download the guide (PDF)
        </a>
      )}
    </div>
  );
}

function PdfIcon() {
  return (
    <svg width="44" height="54" viewBox="0 0 44 54" aria-hidden="true" className="shrink-0">
      <path d="M2 4a2 2 0 0 1 2-2h26l12 12v36a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2Z" fill="#F6F3EC" stroke="#1F3A2B" strokeWidth="2" />
      <path d="M30 2v12h12" fill="none" stroke="#1F3A2B" strokeWidth="2" />
      <rect x="6" y="30" width="26" height="12" rx="2" fill="#A63A2B" />
      <text x="19" y="39.5" textAnchor="middle" fontSize="9" fontWeight="700" fill="#fff" fontFamily="sans-serif">PDF</text>
    </svg>
  );
}

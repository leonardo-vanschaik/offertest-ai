"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId } from "react";

/** The OfferTest mark: a blue shopping bag with a check. Matches public/brand/offertest-lockup-bag-ai.jpg. */
export function LogoMark({ size = 28 }: { size?: number }) {
  const gid = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id={`otg${gid}`} x1="14" y1="16" x2="52" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#0066c2" />
          <stop offset="1" stopColor="#1690ff" />
        </linearGradient>
      </defs>
      <path
        d="M23.5 21v-3.2a8.5 8.5 0 0 1 17 0V21"
        fill="none"
        stroke="#0a6fd6"
        strokeWidth="4.6"
        strokeLinecap="round"
      />
      <path
        d="M16.6 20h30.8a4.6 4.6 0 0 1 4.58 4.2l2.3 26.4A6.4 6.4 0 0 1 47.9 57.6H16.1a6.4 6.4 0 0 1-6.38-7l2.3-26.4A4.6 4.6 0 0 1 16.6 20z"
        fill={`url(#otg${gid})`}
      />
      <path
        d="M23.4 38.6l6 6 11.4-12.2"
        fill="none"
        stroke="#fff"
        strokeWidth="5.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark size={30} />
      <span className="text-[17px] font-semibold tracking-[-0.01em] text-ink-950">
        OfferTest <span className="text-brand-600">AI</span>
      </span>
    </span>
  );
}

const NAV = [
  { href: "/", label: "New test" },
  { href: "/eval", label: "Eval" },
];

export function AppHeader() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-8 px-6">
        <Link href="/" className="shrink-0" aria-label="OfferTest AI home">
          <Wordmark />
        </Link>
        <nav className="flex items-center gap-1">
          {NAV.map((n) => {
            const active = n.href === "/" ? path === "/" || path.startsWith("/runs") : path.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  active ? "bg-surface text-ink-950" : "text-ink-500 hover:bg-surface hover:text-ink-900"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2 text-xs text-ink-500">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1 font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-pass-500" />
            Test mode
          </span>
        </div>
      </div>
    </header>
  );
}

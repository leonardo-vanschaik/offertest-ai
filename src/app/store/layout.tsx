import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import "./_styles/store.css";
import { container } from "./_components/ui";
import { CartLink } from "./_components/CartLink";
import { AnnouncementBar } from "./_components/ShippingNote";

export const metadata: Metadata = {
  title: { default: "Alder Trail Co.", template: "%s | Alder Trail Co." },
  description: "Trail shoes, shells, and packs for long days outside.",
};

const fontVars = {
  "--at-sans":
    'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif',
  "--at-serif": '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif',
  fontFamily: "var(--at-sans)",
  colorScheme: "light",
} as CSSProperties;

export default function StoreLayout({ children }: { children: ReactNode }) {
  return (
    <div className="at-store flex min-h-screen flex-1 flex-col bg-[#F6F3EC] text-[#1E2420] antialiased" style={fontVars}>
      <AnnouncementBar />
      <header className="border-b border-[#E2DCCF] bg-[#F6F3EC]">
        <div className={`${container} flex h-[76px] items-center justify-between`}>
          <Link href="/store" className="flex items-center gap-3" aria-label="Alder Trail Co. home">
            <Mark />
            <span className="font-[family-name:var(--at-serif)] text-[24px] font-semibold tracking-tight text-[#1E2420]">
              Alder Trail Co.
            </span>
          </Link>
          <nav className="flex items-center gap-8 text-[15px] font-medium text-[#1E2420]">
            <Link href="/store#shop" className="hover:underline underline-offset-4">Shop all</Link>
            <Link href="/store/products/ridge-trail-shoe" className="hover:underline underline-offset-4">Footwear</Link>
            <Link href="/store/products/summit-rain-jacket" className="hover:underline underline-offset-4">Outerwear</Link>
            <Link href="/store/products/switchback-daypack" className="hover:underline underline-offset-4">Packs</Link>
            <CartLink />
          </nav>
        </div>
      </header>
      <main className="flex-1">
        {children}
      </main>
      <footer className="mt-20 border-t border-[#E2DCCF] bg-[#EDE8DD]">
        <div className={`${container} grid grid-cols-4 gap-10 py-12 text-[14px] text-[#4A504A]`}>
          <div className="col-span-2">
            <div className="flex items-center gap-3">
              <Mark />
              <span className="font-[family-name:var(--at-serif)] text-[20px] font-semibold text-[#1E2420]">Alder Trail Co.</span>
            </div>
            <p className="mt-3 max-w-sm leading-relaxed">
              Trail gear for long days outside. Designed in Bend, Oregon, and made to be worn, repaired, and worn again.
            </p>
          </div>
          <div>
            <h3 className="mb-3 font-semibold text-[#1E2420]">Shop</h3>
            <ul className="space-y-2">
              <li><Link href="/store/products/ridge-trail-shoe" className="hover:underline">Ridge trail shoe</Link></li>
              <li><Link href="/store/products/summit-rain-jacket" className="hover:underline">Summit rain jacket</Link></li>
              <li><Link href="/store/products/basecamp-wool-socks" className="hover:underline">Basecamp wool socks</Link></li>
              <li><Link href="/store/products/switchback-daypack" className="hover:underline">Switchback daypack</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="mb-3 font-semibold text-[#1E2420]">Help</h3>
            <ul className="space-y-2">
              <li>30-day returns</li>
              <li>Free repairs for 2 years</li>
              <li>help@aldertrail.co</li>
            </ul>
          </div>
        </div>
        <div className={container}>
          <div className="border-t border-[#DCD5C6] py-5 text-[13px] text-[#6B706A]">
            © 2026 Alder Trail Co. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}

function Mark() {
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
      <circle cx="17" cy="17" r="17" fill="#1F3A2B" />
      <path d="M6 24 L13.5 13 L17.5 18.5 L21 14 L28 24 Z" fill="#F1EEE6" />
      <path d="M13.5 13 L15.6 16.1 L13.9 17.6 L12 15.2 Z" fill="#C9D3C4" />
    </svg>
  );
}

import Link from "next/link";
import { cartCount } from "@/lib/store";
import { readCart } from "@/lib/store/cart-cookie";

export async function CartLink() {
  const n = cartCount(await readCart());
  return <CartLinkView count={n} />;
}

export function CartLinkView({ count }: { count: number | null }) {
  return (
    <Link
      href="/store/cart"
      className="inline-flex h-11 items-center gap-2 rounded-md border border-[#C9C2B3] bg-white px-4 text-[16px] font-semibold text-[#1E2420] hover:border-[#1F3A2B]"
      aria-label={count === null ? "Cart" : `Cart, ${count} ${count === 1 ? "item" : "items"}`}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5 8h14l-1.2 11.2a1 1 0 0 1-1 .8H7.2a1 1 0 0 1-1-.8L5 8Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M9 8V6.5a3 3 0 0 1 6 0V8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      Cart{count === null ? "" : ` (${count})`}
    </Link>
  );
}

import { connection } from "next/server";
import { getConfig } from "@/lib/store";
import { formatCents } from "@/lib/types";

export function shippingHeadline(freeOverCents: number | null): string | null {
  if (freeOverCents === 0) return "Free shipping on every order";
  if (freeOverCents === null) return null;
  return `Free shipping on orders of ${formatCents(freeOverCents)} or more`;
}

export async function AnnouncementBar() {
  await connection();
  const text = shippingHeadline(getConfig().shipping.freeOverCents) ?? "Repairs and returns within 30 days";
  return <AnnouncementView text={text} />;
}

export function AnnouncementView({ text }: { text: string }) {
  return (
    <div className="flex h-9 items-center justify-center bg-[#1F3A2B] text-[13px] font-medium tracking-wide text-[#F1EEE6]">
      {text}
    </div>
  );
}

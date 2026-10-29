import Link from "next/link";
import { notFound } from "next/navigation";
import { getConfig } from "@/lib/store";
import { formatCents } from "@/lib/types";
import { container, serif } from "../../_components/ui";
import { shippingHeadline } from "../../_components/ShippingNote";
import { ProductForm } from "./ProductForm";

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const config = getConfig();
  const product = config.products.find((p) => p.slug === slug);
  if (!product) notFound();
  const ship = shippingHeadline(config.shipping.freeOverCents);
  const oneSize = product.variants.length === 1;

  return (
    <div className={`${container} pt-8`}>
      <nav className="text-[14px] text-[#5F655F]" aria-label="Breadcrumb">
        <Link href="/store" className="hover:underline">Home</Link>
        <span className="mx-2">/</span>
        <Link href="/store#shop" className="hover:underline">Shop all</Link>
        <span className="mx-2">/</span>
        <span className="text-[#1E2420]">{product.name}</span>
      </nav>
      <div className="mt-6 grid grid-cols-[1.1fr_1fr] gap-14">
        <div className="overflow-hidden rounded-xl border border-[#E2DCCF] bg-[#ECE6D9]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={product.image} alt={`${product.name} in ${product.color}`} className="aspect-square w-full" />
        </div>
        <div>
          <h1 className={`${serif} text-[40px] font-semibold leading-tight tracking-tight`}>{product.name}</h1>
          <p className="mt-2 text-[16px] text-[#5F655F]">
            Color: <span className="font-semibold text-[#1E2420]">{product.color}</span>
          </p>
          <p className="mt-4 text-[26px] font-semibold tabular-nums" data-testid="product-price">
            {formatCents(product.priceCents)}
          </p>
          {ship && <p className="mt-1 text-[14px] text-[#2F6B3F]">{ship}</p>}
          <div className="mt-6">
            <ProductForm
              productId={product.id}
              oneSize={oneSize}
              variants={product.variants.map((v) => ({ id: v.id, label: v.label, stock: v.stock }))}
            />
          </div>
          <div className="mt-8 border-t border-[#E2DCCF] pt-6">
            <h2 className="text-[16px] font-semibold">Details</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-[#4A504A]">{product.description}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

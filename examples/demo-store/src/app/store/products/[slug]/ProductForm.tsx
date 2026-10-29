"use client";

import { useActionState, useState } from "react";
import { addToCart, type AddState } from "../../actions";
import { btnPrimary } from "../../_components/ui";

type V = { id: string; label: string; stock: number };

export function ProductForm({ productId, variants, oneSize }: { productId: string; variants: V[]; oneSize: boolean }) {
  const [selected, setSelected] = useState<string>(oneSize && variants[0]?.stock > 0 ? variants[0].id : "");
  const [state, action, pending] = useActionState<AddState, FormData>(addToCart, {});
  const [dismissed, setDismissed] = useState<AddState | null>(null);
  const allSoldOut = variants.every((v) => v.stock <= 0);
  const selectedLabel = variants.find((v) => v.id === selected)?.label;

  return (
    <form action={action}>
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="variantId" value={selected} />
      {oneSize ? (
        <p className="text-[15px] text-[#5F655F]">
          Size: <span className="font-semibold text-[#1E2420]">One size</span>
          {allSoldOut && <span className="ml-2 font-semibold text-[#A63A2B]">Sold out</span>}
        </p>
      ) : (
        <fieldset>
          <legend className="mb-3 text-[15px] font-semibold">
            Size{selectedLabel ? <span className="font-normal text-[#5F655F]">: {selectedLabel.replace(/^Size /, "")}</span> : null}
          </legend>
          <div className="grid grid-cols-6 gap-2.5">
            {variants.map((v) => {
              const soldOut = v.stock <= 0;
              const isSel = selected === v.id;
              const short = v.label.replace(/^Size /, "");
              return (
                <button
                  key={v.id}
                  type="button"
                  disabled={soldOut}
                  aria-pressed={isSel}
                  aria-label={soldOut ? `${v.label}, sold out` : v.label}
                  data-variant-id={v.id}
                  onClick={() => {
                    setSelected(v.id);
                    setDismissed(state);
                  }}
                  className={
                    soldOut
                      ? "flex h-[60px] cursor-not-allowed flex-col items-center justify-center rounded-md border border-dashed border-[#CFC8BA] bg-[#EFEBE3] text-[#9A9E98]"
                      : isSel
                        ? "flex h-[60px] flex-col items-center justify-center rounded-md border-2 border-[#1F3A2B] bg-[#1F3A2B] text-white"
                        : "flex h-[60px] flex-col items-center justify-center rounded-md border-2 border-[#C9C2B3] bg-white text-[#1E2420] hover:border-[#1F3A2B]"
                  }
                >
                  <span className={`text-[17px] font-semibold ${soldOut ? "line-through" : ""}`}>{short}</span>
                  {soldOut && <span className="text-[11px] font-semibold uppercase tracking-wide text-[#A63A2B]">Sold out</span>}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}
      <button type="submit" disabled={pending || allSoldOut} className={`${btnPrimary} mt-6 w-full`}>
        {allSoldOut ? "Sold out" : pending ? "Adding..." : "Add to cart"}
      </button>
      {state.error && state !== dismissed && (
        <p role="alert" className="mt-3 rounded-md border border-[#E7C3BB] bg-[#FBEDEA] px-4 py-3 text-[15px] font-medium text-[#A63A2B]">
          {state.error}
        </p>
      )}
    </form>
  );
}

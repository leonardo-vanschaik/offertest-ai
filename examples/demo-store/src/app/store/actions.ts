"use server";

import { redirect } from "next/navigation";
import { checkTestCard, createOrder, getConfig, priceCart } from "@/lib/store";
import { clearCart, readCart, writeCart } from "@/lib/store/cart-cookie";

export type AddState = { error?: string };

export async function addToCart(_prev: AddState, formData: FormData): Promise<AddState> {
  const productId = String(formData.get("productId") ?? "");
  const variantId = String(formData.get("variantId") ?? "");
  const config = getConfig();
  const product = config.products.find((p) => p.id === productId);
  if (!product) return { error: "This product is no longer available." };
  if (!variantId) return { error: "Please select a size." };
  const variant = product.variants.find((v) => v.id === variantId);
  if (!variant) return { error: "Please select a size." };
  if (variant.stock <= 0) return { error: `${variant.label} is sold out.` };

  const cart = await readCart();
  const existing = cart.items.find((i) => i.variantId === variantId && i.productId === productId);
  if (existing) existing.qty = Math.min(existing.qty + 1, variant.stock);
  else cart.items.push({ productId, variantId, qty: 1 });
  await writeCart(cart);
  redirect("/store/cart");
}

export async function setQty(formData: FormData): Promise<void> {
  const variantId = String(formData.get("variantId") ?? "");
  const qty = Number(formData.get("qty"));
  const config = getConfig();
  const cart = await readCart();
  const item = cart.items.find((i) => i.variantId === variantId);
  if (!item || !Number.isFinite(qty)) return;
  const stock =
    config.products.find((p) => p.id === item.productId)?.variants.find((v) => v.id === variantId)?.stock ?? 0;
  if (qty <= 0) cart.items = cart.items.filter((i) => i !== item);
  else item.qty = Math.min(Math.floor(qty), Math.max(stock, 1), 99);
  await writeCart(cart);
}

export async function removeLine(formData: FormData): Promise<void> {
  const variantId = String(formData.get("variantId") ?? "");
  const cart = await readCart();
  cart.items = cart.items.filter((i) => i.variantId !== variantId);
  await writeCart(cart);
}

export async function applyCode(formData: FormData): Promise<void> {
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const cart = await readCart();
  cart.couponCode = code || undefined;
  await writeCart(cart);
}

export async function removeCode(): Promise<void> {
  const cart = await readCart();
  cart.couponCode = undefined;
  await writeCart(cart);
}

export type CheckoutValues = {
  email: string;
  name: string;
  address: string;
  card: string;
  expiry: string;
  cvc: string;
};

export type CheckoutState = { error?: string; values?: CheckoutValues; attempt?: number };

export async function placeOrder(_prev: CheckoutState, formData: FormData): Promise<CheckoutState> {
  const values: CheckoutValues = {
    email: String(formData.get("email") ?? "").trim(),
    name: String(formData.get("name") ?? "").trim(),
    address: String(formData.get("address") ?? "").trim(),
    card: String(formData.get("card") ?? "").trim(),
    expiry: String(formData.get("expiry") ?? "").trim(),
    cvc: String(formData.get("cvc") ?? "").trim(),
  };
  const fail = (error: string): CheckoutState => ({ error, values, attempt: Date.now() });

  if (!values.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) return fail("Enter a valid email address.");
  if (!values.name) return fail("Enter your full name.");
  if (!values.address) return fail("Enter your shipping address.");
  if (!values.card) return fail("Enter your card number.");

  // Never trust the client: re-read the cart and re-price it with the current store config.
  const config = getConfig();
  const cart = await readCart();
  const priced = priceCart(config, cart);
  if (priced.lines.length === 0) return fail("Your cart is empty.");
  for (const line of priced.lines) {
    const v = config.products.find((p) => p.id === line.productId)?.variants.find((x) => x.id === line.variantId);
    if (!v || v.stock < line.qty) return fail(`${line.name} (${line.variantLabel}) is sold out.`);
  }

  const payError = checkTestCard(values.card, values.expiry, values.cvc);
  if (payError) return fail(payError);

  const order = createOrder({
    email: values.email,
    name: values.name,
    address: values.address,
    cardLast4: values.card.replace(/\D/g, "").slice(-4),
    priced,
  });
  await clearCart();
  redirect(`/store/order/${order.id}`);
}

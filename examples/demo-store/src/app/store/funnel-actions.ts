"use server";

import { redirect } from "next/navigation";
import { checkTestCard, getConfig } from "@/lib/store";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------- Trail Club free trial ----------

export type JoinValues = { name: string; email: string; card: string; expiry: string; cvc: string };
export type JoinState = { error?: string; values?: JoinValues; attempt?: number };

export async function joinTrailClub(_prev: JoinState, formData: FormData): Promise<JoinState> {
  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const values: JoinValues = { name: get("name"), email: get("email"), card: get("card"), expiry: get("expiry"), cvc: get("cvc") };
  const password = String(formData.get("password") ?? "");
  const fail = (error: string): JoinState => ({ error, values, attempt: Date.now() });

  if (!values.name) return fail("Enter your name.");
  if (!EMAIL_RE.test(values.email)) return fail("Enter a valid email address.");
  if (password.length < 8) return fail("Choose a password with at least 8 characters.");

  if (getConfig().funnels.trialRequiresCard) {
    if (!values.card) return fail("Enter your card number to start your trial.");
    const payError = checkTestCard(values.card, values.expiry, values.cvc);
    if (payError) return fail(payError);
  }

  redirect("/store/trail-club/welcome");
}

// ---------- First Thru-Hike Guide (lead magnet) ----------

export type GuideState = { error?: string; email?: string; attempt?: number };

export async function requestGuide(_prev: GuideState, formData: FormData): Promise<GuideState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address.", email, attempt: Date.now() };
  redirect("/store/guides/first-thru-hike/thanks");
}

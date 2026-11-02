"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ScenarioName } from "@/lib/types";

export function ScenarioSwitcher({
  current,
  scenarios,
  adminKey,
}: {
  current: ScenarioName;
  scenarios: { name: ScenarioName; label: string }[];
  adminKey?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function post(url: string, body?: unknown, done?: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...(adminKey ? { "x-admin-key": adminKey } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      setMsg(res.ok ? (done ?? "Done.") : `Error ${res.status}: ${await res.text()}`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="grid grid-cols-5 gap-2">
        {scenarios.map((s) => (
          <button
            key={s.name}
            type="button"
            disabled={busy}
            onClick={() => post("/api/store/scenario", { scenario: s.name }, `Scenario set: ${s.name}`)}
            className={`rounded-md border-2 px-3 py-2 text-left text-[13px] disabled:opacity-60 ${
              s.name === current
                ? "border-[#1F3A2B] bg-[#1F3A2B] text-white"
                : "border-[#C9C2B3] bg-white text-[#1E2420] hover:border-[#1F3A2B]"
            }`}
          >
            <span className="block font-mono text-[12px] font-semibold">{s.name}</span>
            <span className="block">{s.label}</span>
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-4">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (confirm("Reset to baseline and delete all orders?")) post("/api/store/reset", undefined, "Store reset.");
          }}
          className="rounded-md border-2 border-[#A63A2B] bg-white px-4 py-2 text-[14px] font-semibold text-[#A63A2B] disabled:opacity-60"
        >
          Reset store and delete orders
        </button>
        {msg && <span className="text-[14px] text-[#4A504A]">{msg}</span>}
      </div>
    </div>
  );
}

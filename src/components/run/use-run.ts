"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Run } from "@/lib/types";
import { needsPolling } from "../format";

export type RunState =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "error"; message: string; run?: Run }
  | { kind: "ok"; run: Run };

/** Polls GET /api/runs/[id] every second while the run is live or waits on a person. */
export function useRun(id: string, intervalMs = 1000) {
  const [state, setState] = useState<RunState>({ kind: "loading" });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);
  const lastRun = useRef<Run | undefined>(undefined);

  const load = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    let keepGoing = true;
    try {
      const res = await fetch(`/api/runs/${encodeURIComponent(id)}`, { cache: "no-store" });
      if (res.status === 404) {
        if (alive.current) setState({ kind: "missing" });
        keepGoing = false;
      } else if (!res.ok) {
        throw new Error(`The server answered ${res.status}.`);
      } else {
        const run = (await res.json()) as Run;
        lastRun.current = run;
        if (alive.current) setState({ kind: "ok", run });
        keepGoing = needsPolling(run);
      }
    } catch (e) {
      if (alive.current)
        setState({ kind: "error", message: e instanceof Error ? e.message : "Network error", run: lastRun.current });
    }
    if (alive.current && keepGoing) timer.current = setTimeout(load, intervalMs);
  }, [id, intervalMs]);

  useEffect(() => {
    alive.current = true;
    load();
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load]);

  return { state, refresh: load };
}

/** A clock that ticks every second while `on` is true. */
export function useNow(on: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [on]);
  return now;
}

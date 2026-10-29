import fs from "node:fs/promises";
import path from "node:path";
import { Suspense } from "react";
import { AppHeader } from "@/components/brand";
import { EvalEmpty, EvalScoreboard } from "@/components/eval/scoreboard";
import type { EvalResults } from "@/components/eval/types";
import sampleEval from "@/fixtures/sample-eval.json";

async function readLatest(): Promise<EvalResults | null> {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), "eval", "results", "latest.json"), "utf8");
    const data = JSON.parse(raw) as EvalResults;
    return data && data.agent && Array.isArray(data.cases) ? data : null;
  } catch {
    return null;
  }
}

async function EvalContent({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const real = await readLatest();
  if (real) return <EvalScoreboard data={real} sample={false} />;
  if (sp.sample === "1") return <EvalScoreboard data={sampleEval as EvalResults} sample />;
  return <EvalEmpty />;
}

export default function EvalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <div className="min-h-screen bg-surface">
      <AppHeader />
      <main className="mx-auto max-w-[1440px] px-6 pb-16 pt-8">
        <Suspense
          fallback={
            <div className="flex flex-col gap-6">
              <div className="skeleton h-10 w-80 rounded-lg" />
              <div className="skeleton h-[220px] rounded-xl" />
              <div className="skeleton h-[400px] rounded-xl" />
            </div>
          }
        >
          <EvalContent searchParams={searchParams} />
        </Suspense>
      </main>
    </div>
  );
}

import { Suspense } from "react";
import { RunSkeleton, RunView } from "@/components/run/run-view";

async function RunLoader({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RunView key={id} id={id} />;
}

export default function RunPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<RunSkeleton />}>
      <RunLoader params={params} />
    </Suspense>
  );
}

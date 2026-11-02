import { cookies } from "next/headers";
import { isScenarioName, setScenario, SCENARIOS } from "@/lib/store";
import { CART_COOKIE } from "@/lib/store/cart-cookie";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body must be JSON: { \"scenario\": ScenarioName }" }, { status: 400 });
  }
  const scenario = (body as { scenario?: unknown } | null)?.scenario;
  if (!isScenarioName(scenario)) {
    return Response.json(
      { error: `Unknown scenario. Use one of: ${SCENARIOS.map((s) => s.name).join(", ")}` },
      { status: 400 },
    );
  }
  const config = await setScenario(scenario);
  (await cookies()).delete(CART_COOKIE);
  return Response.json(config);
}

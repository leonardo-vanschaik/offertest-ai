// OfferTest data model. One run tests one ad: every promise in it, along every funnel it sends people to.

export type LeadForm = {
  id: string;
  name?: string;
  intro?: string; // context card: headline and body the person sees first
  questions: { key: string; label: string; type: string }[];
  thankYou?: { title?: string; body?: string; buttonText?: string; url?: string };
  privacyUrl?: string;
};

// Where the ad sends people. Read from the ad creative when the ad comes from Meta.
export type Destination =
  | { type: "website"; url: string }
  | { type: "lead_form"; formId: string; form?: LeadForm }
  | { type: "messaging"; channel: "messenger" | "whatsapp" | "instagram"; welcomeMessage?: string }
  | { type: "app"; url: string }
  | { type: "call"; phone?: string }
  | { type: "unknown"; note: string };

// A carousel card or a dynamic-creative variant with its own link.
export type AdCard = { headline: string; text?: string; destination: Destination };

export type Ad = {
  source: "manual" | "meta";
  id?: string; // Meta ad id
  name?: string;
  accountId?: string;
  status?: string; // Meta effective_status
  headline: string;
  text: string;
  description?: string;
  cta: string;
  imageUrl?: string; // http(s) URL, data URL, or local file path
  destination: Destination;
  cards?: AdCard[];
};

export type Assertion = {
  id: string; // "a1"
  kind: string; // price | discount | free_shipping | free_trial | availability | lead_magnet | booking | event | guarantee | response_time | other
  claim: string; // a plain test: "Code SAVE20 gives 20% off the Ridge trail shoe"
  adQuote: string; // verbatim span from the ad
  conditions: Record<string, string>;
  card?: number; // index into ad.cards when the promise belongs to one card
};

export type VerdictStatus = "supported" | "contradicted" | "unresolved" | "outside_scope";

export type Verdict = {
  assertionId: string;
  status: VerdictStatus;
  adQuote: string;
  pageQuote: string | null; // verbatim text from a captured page
  evidenceStep: number | null; // Step.n where pageQuote was seen
  reason: string;
  quoteCheck: { adQuoteFound: boolean; pageQuoteFound: boolean };
  downgraded?: boolean; // a supported/contradicted verdict that failed the quote check
};

export type ComputerAction =
  | { type: "click"; button?: string; x: number; y: number }
  | { type: "double_click"; x: number; y: number }
  | { type: "drag"; path: { x: number; y: number }[] }
  | { type: "keypress"; keys: string[] }
  | { type: "move"; x: number; y: number }
  | { type: "scroll"; x: number; y: number; scroll_x: number; scroll_y: number }
  | { type: "type"; text: string }
  | { type: "screenshot" }
  | { type: "wait" };

export type Step = {
  n: number;
  at: string;
  kind: "action" | "note" | "approval" | "model" | "source";
  summary: string;
  actions?: ComputerAction[];
  screenshot?: string; // path relative to the run folder: "shots/003.jpg"
  url?: string;
  modelText?: string;
  click?: { x: number; y: number }; // last click, for the report's cursor marker
};

export type Fix = {
  summary: string; // one sentence the owner can act on
  rationale: string;
  target: "funnel" | "ad";
  steps: string[]; // where to click / what to change
  adCopy?: { headline: string; text: string };
};

export type SamBox = { label: string; left: number; top: number; right: number; bottom: number; w: number; h: number };

export type Overall = "pass" | "fail" | "unresolved";

export type RunResult = {
  schemaVersion: 1;
  tool: { name: "offertest"; version: string };
  id: string;
  createdAt: string;
  finishedAt?: string;
  retestOf?: string;
  ad: Ad;
  assertions: Assertion[];
  steps: Step[];
  verdicts: Verdict[];
  overall?: Overall;
  blocked?: string; // the site blocked the agent (bot wall, login, password page)
  fix?: Fix;
  confirmation?: { url: string; text: string }; // order / signup / booking confirmation reached
  sam?: { screenshot: string; boxes: SamBox[] };
  boundary: string; // how far the test went
  models: Record<string, string>; // job -> model id
  usage: { inputTokens: number; outputTokens: number; images: number; usd: number };
  error?: string;
};

export type RunOptions = {
  outDir: string; // parent folder; the run writes <outDir>/<id>/
  pay?: boolean; // allow a test-mode payment (asks first)
  submit?: boolean; // allow non-payment form submits with the test identity (default true)
  headful?: boolean;
  mobile?: boolean;
  maxTurns?: number;
  maxUsd?: number;
  retestOf?: string;
  baseline?: boolean; // eval only: one look at the landing page, no agent
  approve?: (req: { kind: "payment" | "safety_check"; title: string; detail: string }) => Promise<boolean>;
  onStep?: (step: Step, result: RunResult) => void;
  onPhase?: (phase: string) => void;
};

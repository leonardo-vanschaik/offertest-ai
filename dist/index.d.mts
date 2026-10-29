import "playwright-core";

//#region src/types.d.ts
type LeadForm = {
  id: string;
  name?: string;
  intro?: string;
  questions: {
    key: string;
    label: string;
    type: string;
  }[];
  thankYou?: {
    title?: string;
    body?: string;
    buttonText?: string;
    url?: string;
  };
  privacyUrl?: string;
  readError?: string;
};
type Destination = {
  type: "website";
  url: string;
} | {
  type: "lead_form";
  formId: string;
  form?: LeadForm;
} | {
  type: "messaging";
  channel: "messenger" | "whatsapp" | "instagram";
  welcomeMessage?: string;
} | {
  type: "app";
  url: string;
} | {
  type: "call";
  phone?: string;
} | {
  type: "unknown";
  note: string;
};
type AdCard = {
  headline: string;
  text?: string;
  destination: Destination;
};
type Ad = {
  source: "manual" | "meta";
  id?: string;
  name?: string;
  accountId?: string;
  status?: string;
  headline: string;
  text: string;
  description?: string;
  cta: string;
  imageUrl?: string;
  imageText?: string;
  destination: Destination;
  cards?: AdCard[];
};
type Assertion = {
  id: string;
  kind: string;
  claim: string;
  adQuote: string;
  conditions: Record<string, string>;
  card?: number;
};
type VerdictStatus = "supported" | "contradicted" | "unresolved" | "outside_scope";
type Verdict = {
  assertionId: string;
  status: VerdictStatus;
  adQuote: string;
  pageQuote: string | null;
  evidenceStep: number | null;
  reason: string;
  quoteCheck: {
    adQuoteFound: boolean;
    pageQuoteFound: boolean;
  };
  downgraded?: boolean;
};
type ComputerAction = {
  type: "click";
  button?: string;
  x: number;
  y: number;
} | {
  type: "double_click";
  x: number;
  y: number;
} | {
  type: "drag";
  path: {
    x: number;
    y: number;
  }[];
} | {
  type: "keypress";
  keys: string[];
} | {
  type: "move";
  x: number;
  y: number;
} | {
  type: "scroll";
  x: number;
  y: number;
  scroll_x: number;
  scroll_y: number;
} | {
  type: "type";
  text: string;
} | {
  type: "screenshot";
} | {
  type: "wait";
};
type Step = {
  n: number;
  at: string;
  kind: "action" | "note" | "approval" | "model" | "source";
  summary: string;
  actions?: ComputerAction[];
  screenshot?: string;
  url?: string;
  modelText?: string;
  click?: {
    x: number;
    y: number;
  };
};
type Fix = {
  summary: string;
  rationale: string;
  target: "funnel" | "ad";
  steps: string[];
  adCopy?: {
    headline: string;
    text: string;
  };
};
type SamBox = {
  label: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
  w: number;
  h: number;
};
type Overall = "pass" | "fail" | "unresolved";
type RunResult = {
  schemaVersion: 1;
  tool: {
    name: "offertest";
    version: string;
  };
  id: string;
  createdAt: string;
  finishedAt?: string;
  retestOf?: string;
  ad: Ad;
  assertions: Assertion[];
  steps: Step[];
  verdicts: Verdict[];
  overall?: Overall;
  blocked?: string;
  fix?: Fix;
  confirmation?: {
    url: string;
    text: string;
  };
  sam?: {
    screenshot: string;
    boxes: SamBox[];
  };
  boundary: string;
  models: Record<string, string>;
  usage: {
    inputTokens: number;
    outputTokens: number;
    images: number;
    usd: number;
  };
  error?: string;
};
type RunOptions = {
  outDir: string;
  pay?: boolean;
  submit?: boolean;
  headful?: boolean;
  agentCheckout?: boolean;
  retryHeadful?: boolean;
  confirmSafetyChecks?: boolean;
  mobile?: boolean;
  maxTurns?: number;
  maxUsd?: number;
  retestOf?: string;
  baseline?: boolean;
  approve?: (req: {
    kind: "payment" | "safety_check";
    title: string;
    detail: string;
  }) => Promise<boolean>;
  onStep?: (step: Step, result: RunResult) => void;
  onPhase?: (phase: string) => void;
};
//#endregion
//#region src/core/run.d.ts
declare const VERSION = "0.1.0";
declare function runTest(ad: Ad, opts: RunOptions): Promise<{
  result: RunResult;
  dir: string;
}>;
//#endregion
//#region src/meta/ads.d.ts

declare function getAd(adId: string): Promise<Ad>;
declare function listAds(account?: string, statuses?: string[]): Promise<Ad[]>;
declare function pauseAd(adId: string): Promise<void>;
declare function getLeadForm(formId: string, pageId?: string): Promise<LeadForm | undefined>;
//#endregion
//#region src/report/html.d.ts
declare function writeReport(result: RunResult, dir: string): string;
//#endregion
export { Ad, AdCard, Assertion, ComputerAction, Destination, Fix, LeadForm, Overall, RunOptions, RunResult, SamBox, Step, VERSION, Verdict, VerdictStatus, getAd, getLeadForm, listAds, pauseAd, runTest, writeReport };
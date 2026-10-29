// Shape of eval/results/latest.json (written by eval/run.ts).

export type EvalGot = "pass" | "fail" | "unresolved";

export type EvalSummary = {
  total: number;
  hits: number; // verdict equals the label
  misses: number; // expected fail, got pass or unresolved
  falseAlarms: number; // expected pass, got fail
  unresolved: number; // got unresolved (errored runs count here)
  completed: number; // finished without error
  usd: number; // total
  ms: number; // total
};

export type EvalCaseRun = { got: EvalGot; runId: string; usd: number; ms: number; error?: string };

export type EvalCaseResult = {
  id: string;
  scenario: string;
  adHeadline: string;
  expected: "pass" | "fail";
  agent: EvalCaseRun;
  oneCall?: EvalCaseRun;
};

export type EvalResults = {
  ranAt: string;
  agent: EvalSummary;
  oneCall?: EvalSummary;
  cases: EvalCaseResult[];
};

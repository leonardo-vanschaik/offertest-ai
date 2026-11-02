# Contributing

Thanks for helping. Bug reports, new funnel types, and fixes for real stores are all welcome.

## Set up

Node 22.12 or later.

```bash
npm install
npx offertest demo        # check that the build and the recordings work
```

To run real checks you need a Meta Model API key: `npx offertest init`.

## Tests

| Command | What it runs | Needs |
|---|---|---|
| `npm run typecheck` | TypeScript | nothing |
| `npm test` | Unit tests, the demo replay, the tamper checks | nothing |
| `npm run test:e2e` | The browser guard and the agent checkouts | the sample store on `:3000` |
| `npm run test:journeys` | 46 user journeys through the real CLI, with Meta faked | the sample store on `:3000` |

Start the sample store in a second terminal: `(cd examples/demo-store && npm install && npm run dev)`. The journeys switch its scenario, so do not use it for anything else while they run.

The journeys fake Meta with the same API contract as the real Model API and Marketing API. They test the wiring. The [benchmark](eval/README.md) tests the real models.

## Rules for a change

- **Run `npm run build` and commit `dist/`.** People run the built CLI. CI fails when `dist/` does not match a fresh build.
- **Add a test for a bug fix.** Payment and form-submit safety changes need a browser test in `test/guard.e2e.ts`.
- **Keep the agent from paying.** Nothing may weaken the payment guard or `--no-submit`. See "Safety" in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
- **Never change a recording by hand.** Make a new one with `examples/recordings/make.ts` (see its [README](examples/recordings/README.md)).
- **Every model the tool calls at runtime is one of Meta's.**
- Write docs and messages in short, plain sentences.

## Pull requests

One topic per pull request. Say what changed, why, and how you tested it. CI must pass.

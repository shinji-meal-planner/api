# Meal Planner API

NestJS REST API behind the Safe Meal Planner. It serves two planners:

- **Weight-goal planner** (`POST /plan`): checks a weight goal against fixed safety rules, then has Google Gemini write a 7-day meal plan one week at a time. Every day's calories and every ingredient (against the user's allergies) are checked in code before the plan is returned.
- **Budget planner** (`POST /budget/prices`, `POST /budget/plan`): estimates local grocery prices, works out the minimum budget that can feed the household, and plans a week of meals that fits the budget.

The AI only writes meal plans and explanations. Whether a goal or budget is safe is always decided in code.

## What to install

| Tool | Version | Notes |
|---|---|---|
| [Node.js](https://nodejs.org/) | 22.12 or newer (22 LTS or 24 LTS) | npm comes with it |
| Git | any recent version | to clone the repo |
| A Gemini API key | free | get one at <https://aistudio.google.com/apikey> |

There is no database. Price lists are cached in memory and cleared when the server restarts.

## Environment variables

Copy the example file and fill it in:

```bash
cp .env.example .env.local
```

The API reads `.env.local` first, then `.env`. Both are git-ignored, so never commit your key.

| Variable | Required | Default | What it does |
|---|---|---|---|
| `GEMINI_API_KEY` | **yes** | none | Google Gemini API key. Without it the server still starts, but every planning request fails with a 500 error. |
| `GEMINI_MODEL` | no | `gemini-3.8-flash` | The first model to try. |
| `GEMINI_FALLBACK_MODELS` | no | `gemini-3.7-flash,gemini-3.6-flash` | Comma-separated models to try in order when the previous one is rate-limited (429) or overloaded (503). |
| `PORT` | no | `3021` | Port the API listens on. |
| `WEB_ORIGIN` | no | `http://localhost:3020` | Origins allowed by CORS, comma-separated. Set it to wherever the web front end runs. |

The free Gemini tier allows about 20 requests per model per day, which is why the fallback models exist.

## Run it locally

```bash
git clone git@github.com:shinji-meal-planner/api.git
cd api
npm install
cp .env.example .env.local   # then add GEMINI_API_KEY
npm run start:dev            # watches and restarts on changes
```

The API is now on <http://localhost:3021>. To check it's up:

```bash
curl http://localhost:3021/plan/options
```

That returns the activity levels and health conditions the form uses. It doesn't call Gemini.

To use it from a browser, also run the web front end on port 3020 with `NEXT_PUBLIC_API_URL=http://localhost:3021`.

### Production build

```bash
npm run build
npm run start:prod   # runs dist/main.js
```

## Scripts

| Command | What it does |
|---|---|
| `npm run start:dev` | Run with file watching |
| `npm run start:debug` | Run with file watching and the Node inspector |
| `npm run build` | Compile to `dist/` |
| `npm run start:prod` | Run the compiled build |
| `npm test` | Unit tests (`src/**/*.spec.ts`): safety rules, allergens, plan checks, budget costing |
| `npm run test:e2e` | HTTP tests (`test/**/*.e2e-spec.ts`) with Gemini mocked, so they need no key and use no quota |
| `npm run test:cov` | Unit tests with coverage |
| `npm run lint` | oxlint with type-aware rules |
| `npm run format` | Prettier |

Run a single test file or a single test:

```bash
npx vitest run src/plan/feasibility.spec.ts
npx vitest run -t "part of the test name"
```

## Endpoints

| Method | Path | Rate limit | Purpose |
|---|---|---|---|
| `GET` | `/plan/options` | 60/min | Activity levels and health conditions for the form |
| `POST` | `/plan` | 6/min | Weight-goal plan for one week (`week` selects which) or a refusal with reasons |
| `POST` | `/budget/prices` | 6/min | AI price estimates for a country and city, cached for 7 days |
| `POST` | `/budget/plan` | 6/min | Budget meal plan from a confirmed price list, or a refusal with the minimum budget |

Rate limits are per client. Request bodies are validated strictly: unknown fields are rejected with a 400.

## Disclaimer

Not medical advice. Calories, macros and prices are estimates.

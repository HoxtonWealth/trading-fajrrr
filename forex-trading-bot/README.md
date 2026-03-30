# Autonomous Forex Trading Bot

Fully autonomous, self-learning forex trading bot operating on OANDA with $1K–$5K capital.

## Stack
- **Next.js** on Vercel (cron jobs, API routes)
- **Supabase** (Postgres database)
- **OpenRouter** (LLM routing)
- **OANDA v20** (broker)
- **Telegram** (alerts)

## Getting Started

### Prerequisites
- Node.js 20+
- OANDA practice account + API key
- Supabase project
- Vercel account
- OpenRouter API key

### Setup
```bash
npm install
cp .env.example .env.local
# Fill in your API keys in .env.local
npm run dev
```

### Environment Variables
See `.env.example` for all required variables.

## Project Structure
```
app/api/cron/          → Vercel cron jobs
lib/services/          → API clients (OANDA, Supabase, OpenRouter)
lib/indicators/        → Technical indicators (pure functions)
lib/risk/              → Risk management (IMMUTABLE constants + checks)
memory/                → Living project memory (updated every session)
_bmad-output/          → Planning artifacts, workflows, templates
.claude/               → Claude Code conventions and sub-agents
```

## Documentation
- **Blueprint:** `_bmad-output/planning-artifacts/trading-bot-blueprint-v3.md`
- **Architecture decisions:** `memory/decisions.md`
- **Session protocol:** `.claude/session.md`

## Development Methodology
This project uses structured Claude Code sessions with persistent memory.
See `_bmad-output/prompts/` for session templates.

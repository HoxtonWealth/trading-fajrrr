# UI Rework — Design Specification

> Source of truth for the full dashboard rework.
> Claude Code: read this BEFORE writing any code.

## Current State

Single Next.js 16 app (`forex-trading-bot/`) deployed on Vercel.
- No CSS framework (inline styles, monospace font)
- Server-rendered pages with `force-dynamic`
- 3 routes: `/` (landing), `/dashboard`, `/markets`
- Separate `forex-bot-monitor/` on Render (do NOT touch)

## Target State

Professional trading dashboard with:
- Tailwind CSS v4 for styling
- Warm light editorial design (cream/beige, serif headings, green accent)
- Icon-only sidebar + stats header
- Client components with Supabase realtime subscriptions
- 2 main pages: `/dashboard` and `/markets`

---

## Design Direction

Warm, light, editorial. Cream/beige tones, NOT cold white, NOT dark mode.
Inspired by the "Global Markets" reference screenshot the user approved.

---

## Color System

```css
/* Inside @theme inline (Tailwind 4) */
--color-bg-page: #faf9f6;
--color-bg-surface: #ffffff;
--color-bg-warm: #f7f5f0;
--color-bg-warm-hover: #f0ede6;
--color-border: #e8e5de;
--color-border-light: #f0ede6;
--color-text-primary: #1a1a1a;
--color-text-mid: #4a4a4a;
--color-text-muted: #8a8a82;
--color-green: #2d8a56;
--color-green-bg: #e8f5ee;
--color-red: #c0392b;
--color-red-bg: #fdf0ee;
--color-amber: #d4a017;
--color-amber-bg: #fdf8e8;
```

Also duplicate as `:root` CSS custom properties for inline style access.

---

## Typography

- **Serif** (page titles, card titles, instrument names, briefing text): `Georgia, 'Times New Roman', serif`
- **Sans** (labels, values, badges, nav, tables): `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', sans-serif`

| Element | Font | Size | Weight | Color |
|---------|------|------|--------|-------|
| Page title | serif | 18px | 600 | text-primary |
| Card/section title | serif | 15px | 600 | text-primary |
| Instrument names | serif | 14px | 600 | text-primary |
| Table headers | sans | 11px | 500 | text-muted |
| Table data | sans | 13px | 400 | text-primary |
| Ticker label | sans | 11px | 500 | text-muted, uppercase |
| Ticker value | serif | 18px | 600 | text-primary |
| Badges/tags | sans | 10-11px | 600 | contextual |
| Briefing body | serif | 13px | 400 | text-mid, line-height 1.65 |
| Timestamps | sans | 11px | 400 | text-muted |
| Section dividers | sans | 11px | 600 | text-muted, uppercase, tracking 0.6px |

---

## Layout

```
┌──────┬──────────────────────────────────────────────────────┐
│      │           HEADER (52px)                              │
│ SIDE │  Stats (Equity, P&L, Drawdown)    Live | KillSwitch  │
│ BAR  │──────────────────────────────────────────────────────│
│ 52px │                                                      │
│      │  PAGE CONTENT                                        │
│ icon │  (varies per page)                                   │
│ only │                                                      │
│      │                                                      │
└──────┴──────────────────────────────────────────────────────┘
```

---

## Sidebar (52px, icon-only)

- Background: #ffffff, border-right 0.5px solid #e8e5de
- Top: green logo (bg #2d8a56, 22x22, rounded 10px, white SVG pulse-line)
- Gap 12px, then nav icons
- Each icon: 36x36 hit area, rounded 8px
- Active: bg #e8f5ee, color #2d8a56
- Inactive: color #8a8a82, hover bg #f7f5f0
- SVG: viewBox 0 0 24 24, stroke currentColor, stroke-width 1.5

Nav items:
1. Dashboard (/dashboard) — 4-square grid icon
2. Markets (/markets) — chart line ascending icon

---

## Header (52px)

- Border-bottom 0.5px solid #e8e5de, padding 0 28px
- Left: equity stats (from equity_snapshots): Equity, Daily P&L, Drawdown — sans 12px
- Right: "Live" badge (green) + Kill Switch badge
- Badge style: sans 11px, 500 weight, px-3 py-1, rounded-md, 0.5px border
- Kill switch off: text #c0392b, border #c0392b
- Kill switch on: bg #fdf0ee, text #c0392b, border #c0392b
- Data: realtime subscription to equity_snapshots + system_state

---

## Database Tables (actual names and columns)

### equity_snapshots
equity, balance, unrealized_pnl, drawdown_percent, daily_pnl, open_positions, created_at

### trades
instrument, direction, strategy, status, entry_price, exit_price, pnl, confidence, agent_agreement, opened_at, closed_at

### agent_scorecards
agent, instrument, total_trades, win_rate, avg_pnl, weight

### prediction_signals
signal_type, description, strength, direction, status

### system_state
key (text), value (text) — rows include: kill_switch, weekend_mode

### cron_logs
cron_name, success, summary, created_at

### market_assets
id, name, symbol, category, enabled

### market_prices
asset_id, price, change_24h_pct, change_1w_pct, change_1q_pct, recorded_at

### market_analyses
analysis_date, market_summary, key_movers (jsonb), geopolitical_watch, week_ahead

### news_cache
title, url, source, category, sentiment_score, data_source, fetched_at

### economic_events
event_name, country, impact, event_time

---

## /dashboard Page Design

Two-column layout: main (flex-1) + right panel (320px, bg #f7f5f0)

**Main column:**
1. **Ticker cards** (4-col grid): Equity, Balance, Daily P&L, Drawdown
   - Data from: equity_snapshots (latest row)
2. **Recent trades** table with section groupings (Open / Closed)
   - Columns: Instrument, Direction, Strategy, Entry, P&L, Time
   - Data from: trades (realtime)
3. **Agent scorecards** table
   - Columns: Agent, Instrument, Trades, Win Rate, Avg P&L, Weight
   - Data from: agent_scorecards

**Right panel (320px, bg #f7f5f0):**
1. **Bot status** — system_state values, kill switch state
2. **Active signals** — from prediction_signals where status = 'active'
3. **Recent activity** — last 10 cron_logs with success/fail indicator

---

## /markets Page Design

Two-column layout: main (flex-1) + right panel (320px, bg #f7f5f0)

**Main column:**
1. **Ticker cards** (4-col grid): top 4 movers from market_prices
2. **Asset grid** — grouped table by category (Equities, Currencies, Commodities, Bonds, Crypto, Volatility)
   - Columns: Instrument, Price, 24h, 1W, 1Q
   - Section headers per category (uppercase, sans 11px, muted)
   - Positive %: green, negative %: red
   - Data from: market_assets + market_prices (realtime on market_prices)

**Right panel:**
1. **Morning briefing** — from market_analyses (latest row)
   - Sections: Summary, Key Movers, Geopolitical Watch, Week Ahead
2. **Economic calendar** — from economic_events (next 7 days)
   - Impact dots: low=green, medium=amber, high=red

---

## Client-Side Supabase

Create `lib/supabase-browser.ts`:
```typescript
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
```

All page components use `'use client'` + this client for queries and realtime.

Env vars needed (add to .env.local and .env.example):
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY

---

## Shared Patterns

### Direction tags
Long: bg #e8f5ee, text #2d8a56. Short: bg #fdf0ee, text #c0392b.
Sans 10px, 600 weight, uppercase, px 7px py 2px, rounded 4px.

### % change colors
Positive: #2d8a56. Negative: #c0392b. Zero/null: #8a8a82.

### Loading: skeleton rectangles, bg #f7f5f0, pulse animation.
### Error: bg #fdf0ee, text #c0392b.
### Empty: serif italic, centered, #8a8a82.

### Cards (ticker): bg #f7f5f0, border 0.5px solid #f0ede6, rounded 8px, p 12px 14px.
### Cards (content): bg #ffffff, border 0.5px solid #e8e5de, rounded 10px.
### Tables: no card wrapper, flat on page bg, 0.5px borders.

---

## DO NOT TOUCH

- `lib/pipeline.ts` and all `lib/` business logic
- `lib/services/` (supabase.ts, capital.ts, openrouter.ts, telegram.ts, etc.)
- `lib/risk/`, `lib/agents/`, `lib/strategies/`, `lib/indicators/`, `lib/learning/`
- `app/api/` (all API routes and cron jobs)
- `forex-bot-monitor/` (Render service)
- `supabase/migrations/`
- `__tests__/`
- `lib/types/database.ts` (read it for types, don't modify)

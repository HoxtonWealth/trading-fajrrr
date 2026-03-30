# Workflow: Create Cron Endpoint

## Trigger
Use this workflow when creating any new `app/api/cron/*/route.ts` file.

## Inputs
- Cron function name (e.g., `ingest-candles`)
- Frequency (e.g., every 15 min)
- What it does (one sentence)

## Steps

### 1. Create the route file
Create `app/api/cron/[name]/route.ts` with this structure:
```typescript
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    // 1. Fetch data from source
    // 2. Process/transform
    // 3. Write to Supabase
    // 4. Return success with summary
    return NextResponse.json({ success: true, summary: '...' })
  } catch (error) {
    console.error('[cron/name] Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
```

### 2. Add to vercel.json
Add the cron schedule:
```json
{
  "crons": [
    { "path": "/api/cron/[name]", "schedule": "*/15 * * * *" }
  ]
}
```

### 3. Test locally
- Run `curl http://localhost:3000/api/cron/[name]`
- Verify Supabase receives data
- Verify response includes meaningful summary

### 4. Verify timing
- The function MUST complete within 60 seconds
- If it might be slow, add timing logs

## Validation
- [ ] Route returns JSON with `success` field
- [ ] Error handling catches and logs failures
- [ ] Cron schedule added to `vercel.json`
- [ ] Function completes under 60s
- [ ] Data appears in Supabase after execution

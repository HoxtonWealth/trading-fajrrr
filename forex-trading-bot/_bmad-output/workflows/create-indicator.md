# Workflow: Create Indicator

## Trigger
Use when creating any new `lib/indicators/*.ts` file.

## Inputs
- Indicator name (e.g., EMA, ADX, ATR)
- Formula reference (from blueprint Section 12)

## Steps

### 1. Create the indicator file
`lib/indicators/[name].ts` — pure function, no side effects:
```typescript
export interface Candle {
  time: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export function calculateEMA(candles: Candle[], period: number): number[] {
  // Implementation
}
```

### 2. Write tests
`__tests__/indicators/[name].test.ts`:
- Test with known input/output pairs (calculate by hand or use a reference)
- Test edge cases: empty array, array shorter than period, single candle

### 3. Verify
- Run `npx vitest run indicators`
- All tests pass

## Validation
- [ ] Pure function (no external calls, no side effects)
- [ ] TypeScript types for input and output
- [ ] At least 3 test cases including edge cases
- [ ] Formula matches blueprint Section 12

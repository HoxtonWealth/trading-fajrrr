/** AED/USD fixed peg — account is in AED, instruments trade in USD/GBP/JPY/EUR */
export const AED_PER_USD = 3.6725

/** Convert AED equity to USD */
export function equityToUSD(equityAED: number): number {
  return equityAED / AED_PER_USD
}

/**
 * Simple RSS/XML parser for central bank feeds.
 * Uses regex-based parsing to avoid external dependencies.
 */

export interface RSSItem {
  title: string
  link: string
  pubDate: string
  description: string
}

const CENTRAL_BANK_FEEDS = {
  fed: 'https://www.federalreserve.gov/feeds/press_all.xml',
  ecb: 'https://www.ecb.europa.eu/rss/press.html',
  boe: 'https://www.bankofengland.co.uk/rss/publications',
}

export async function fetchCentralBankRSS(bank: keyof typeof CENTRAL_BANK_FEEDS): Promise<RSSItem[]> {
  try {
    const response = await fetch(CENTRAL_BANK_FEEDS[bank], {
      headers: { 'User-Agent': 'ForexTradingBot/1.0' },
    })

    if (!response.ok) {
      console.error(`[rss-parser] ${bank} feed returned ${response.status}`)
      return []
    }

    const xml = await response.text()
    return parseRSSXml(xml)
  } catch (error) {
    console.error(`[rss-parser] Failed to fetch ${bank} RSS:`, error)
    return []
  }
}

export async function fetchAllCentralBankNews(): Promise<RSSItem[]> {
  const results = await Promise.allSettled([
    fetchCentralBankRSS('fed'),
    fetchCentralBankRSS('ecb'),
    fetchCentralBankRSS('boe'),
  ])

  return results
    .filter((r): r is PromiseFulfilledResult<RSSItem[]> => r.status === 'fulfilled')
    .flatMap(r => r.value)
}

function parseRSSXml(xml: string): RSSItem[] {
  const items: RSSItem[] = []
  const itemRegex = /<item>([\s\S]*?)<\/item>/g
  let match

  while ((match = itemRegex.exec(xml)) !== null) {
    const content = match[1]
    const title = extractTag(content, 'title')
    const link = extractTag(content, 'link')
    const pubDate = extractTag(content, 'pubDate')
    const description = extractTag(content, 'description')

    if (title) {
      items.push({ title, link, pubDate, description })
    }
  }

  return items.slice(0, 20) // Limit to 20 most recent
}

function extractTag(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?<\\/${tag}>`, 's')
  const match = regex.exec(xml)
  return match ? match[1].trim() : ''
}

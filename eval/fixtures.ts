/**
 * A fixed synthetic catalog (spec §5 Phase 5 gate). Two tiers, on purpose:
 *
 * 1. The original 20 resources, one per domain, spanning unrelated areas
 *    (weather vs. translate vs. currency, etc.) — easy true positives,
 *    useful as a sanity floor but not a real test of discrimination,
 *    since there's only ever one plausible candidate per query.
 * 2. ~15 *clusters* of 2-4 near-duplicate resources each (weather vs.
 *    weather-forecast vs. air-quality vs. uv-index; currency vs.
 *    crypto-price vs. historical-fx-rates; and so on) — genuine hard
 *    negatives, where a naive lexical or semantic match plausibly picks
 *    the *wrong* resource in the same domain. `golden.jsonl`'s queries
 *    against these clusters are what actually tests whether the ranker
 *    discriminates, not just whether it can find the one obvious answer
 *    among twenty unrelated options. Added after a review correctly
 *    pointed out that a near-perfect score on tier 1 alone is an
 *    overfitting signal, not evidence of good ranking — see
 *    `docs/DEFERRED.md`.
 *
 * Each fixture's `description`/`parameters` shape matches exactly what
 * `apps/facilitator/src/discovery.ts` extracts from a real bazaar
 * extension — this file is the only place in the repo that constructs
 * that shape by hand instead of from a real payment, since there's no
 * other way to get a fixed, reproducible catalog to grade queries against.
 */

export interface CatalogFixture {
  readonly id: string;
  readonly type: "http" | "mcp";
  readonly toolName?: string;
  readonly routeTemplate?: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
}

const httpParams = (
  properties: Record<string, { type: string; description: string }>
): Record<string, unknown> => ({
  input: { properties },
});

const mcpParams = (
  properties: Record<string, { type: string; description: string }>
): Record<string, unknown> => ({
  input: { type: "object", properties },
});

export const FIXTURES: readonly CatalogFixture[] = [
  {
    id: "weather",
    type: "http",
    description: "Current weather conditions by city",
    parameters: httpParams({
      city: { type: "string", description: "City name, e.g. San Francisco" },
      units: { type: "string", description: "Temperature unit, celsius or fahrenheit" },
    }),
  },
  {
    id: "translate",
    type: "http",
    description: "Translate text from one language to another",
    parameters: httpParams({
      text: { type: "string", description: "Text to translate" },
      targetLanguage: { type: "string", description: "Target language code, e.g. es, fr, ja" },
    }),
  },
  {
    id: "currency",
    type: "http",
    description: "Currency conversion between two currencies at the current exchange rate",
    parameters: httpParams({
      amount: { type: "number", description: "Amount to convert" },
      from: { type: "string", description: "Source currency code, e.g. USD" },
      to: { type: "string", description: "Target currency code, e.g. MXN" },
    }),
  },
  {
    id: "stock-quote",
    type: "http",
    description: "Real-time stock price quote for a publicly traded company",
    parameters: httpParams({
      ticker: { type: "string", description: "Stock ticker symbol, e.g. AAPL" },
    }),
  },
  {
    id: "image-generation",
    type: "http",
    description: "Generate an image from a text prompt using a diffusion model",
    parameters: httpParams({
      prompt: { type: "string", description: "Text description of the desired image" },
      size: { type: "string", description: "Output image resolution, e.g. 1024x1024" },
    }),
  },
  {
    id: "web-search",
    type: "http",
    description: "Search the public web and return ranked results",
    parameters: httpParams({
      query: { type: "string", description: "Search terms" },
    }),
  },
  {
    id: "geocode",
    type: "http",
    description: "Convert a street address into latitude and longitude coordinates",
    parameters: httpParams({
      address: { type: "string", description: "Postal address to geocode" },
    }),
  },
  {
    id: "sentiment",
    type: "http",
    description: "Analyze the emotional tone of a piece of text as positive, negative, or neutral",
    parameters: httpParams({
      text: { type: "string", description: "Text to analyze" },
    }),
  },
  {
    id: "summarize",
    type: "http",
    description: "Condense a long article or document into a short summary",
    parameters: httpParams({
      text: { type: "string", description: "Full text to summarize" },
      maxWords: { type: "number", description: "Maximum length of the summary in words" },
    }),
  },
  {
    id: "qr-code",
    type: "http",
    description: "Generate a scannable QR code image encoding a given URL or text",
    parameters: httpParams({
      data: { type: "string", description: "URL or text to encode" },
    }),
  },
  {
    id: "url-shortener",
    type: "http",
    description: "Shorten a long URL into a compact redirect link",
    parameters: httpParams({
      url: { type: "string", description: "The long URL to shorten" },
    }),
  },
  {
    id: "send-email",
    type: "http",
    description: "Send a transactional email to a recipient",
    parameters: httpParams({
      to: { type: "string", description: "Recipient email address" },
      subject: { type: "string", description: "Email subject line" },
      body: { type: "string", description: "Email body text" },
    }),
  },
  {
    id: "pdf-generate",
    type: "http",
    description: "Render HTML content into a downloadable PDF document",
    parameters: httpParams({
      html: { type: "string", description: "HTML content to render" },
    }),
  },
  {
    id: "sports-scores",
    type: "http",
    description: "Live scores and results for professional sports games",
    parameters: httpParams({
      league: { type: "string", description: "League name, e.g. NBA, Premier League" },
    }),
  },
  {
    id: "news-headlines",
    type: "http",
    description: "Latest news headlines filtered by topic or category",
    parameters: httpParams({
      category: { type: "string", description: "News category, e.g. technology, business" },
    }),
  },
  {
    id: "file-storage",
    type: "http",
    description: "Upload and store a file, returning a permanent download URL",
    parameters: httpParams({
      file: { type: "string", description: "Base64-encoded file content" },
    }),
  },
  {
    id: "route-directions",
    type: "http",
    routeTemplate: "/directions/:origin/:destination",
    description: "Turn-by-turn driving directions and travel time between two locations",
    parameters: httpParams({
      origin: { type: "string", description: "Starting address or coordinates" },
      destination: { type: "string", description: "Destination address or coordinates" },
    }),
  },
  {
    id: "mcp-calculator",
    type: "mcp",
    toolName: "arithmetic_calculator",
    description: "Evaluate a mathematical expression and return the numeric result",
    parameters: mcpParams({
      expression: { type: "string", description: "Mathematical expression to evaluate" },
    }),
  },
  {
    id: "mcp-calendar",
    type: "mcp",
    toolName: "schedule_meeting",
    description: "Schedule a calendar meeting and send invitations to attendees",
    parameters: mcpParams({
      title: { type: "string", description: "Meeting title" },
      attendees: { type: "string", description: "Comma-separated attendee email addresses" },
      startTime: { type: "string", description: "Meeting start time, ISO 8601" },
    }),
  },
  {
    id: "mcp-financial-analysis",
    type: "mcp",
    toolName: "financial_analysis",
    description:
      "Analyze financial fundamentals for a given ticker: valuation, ratios, and recommendation",
    parameters: mcpParams({
      ticker: { type: "string", description: "Stock ticker symbol" },
      analysisType: { type: "string", description: "fundamental, technical, or sentiment" },
    }),
  },

  // --- Hard-negative clusters below: near-duplicate resources within the
  // same domain, added specifically so golden.jsonl has queries that force
  // real discrimination instead of picking the one obvious answer among
  // unrelated options. See the module doc above.

  // Cluster: weather (extends "weather")
  {
    id: "weather-forecast",
    type: "http",
    description: "7-day weather forecast outlook for a city, not just current conditions",
    parameters: httpParams({
      city: { type: "string", description: "City name" },
      days: { type: "number", description: "Number of forecast days, up to 7" },
    }),
  },
  {
    id: "air-quality",
    type: "http",
    description: "Air quality index and pollution levels for a location",
    parameters: httpParams({
      city: { type: "string", description: "City name" },
    }),
  },
  {
    id: "uv-index",
    type: "http",
    description: "UV index and sun exposure forecast for a location",
    parameters: httpParams({
      city: { type: "string", description: "City name" },
    }),
  },
  {
    id: "weather-alerts",
    type: "http",
    description: "Active severe weather warnings and alerts for a region",
    parameters: httpParams({
      region: { type: "string", description: "Region or area name" },
    }),
  },

  // Cluster: currency / finance (extends "currency", "stock-quote")
  {
    id: "crypto-price",
    type: "http",
    description: "Real-time price quote for a cryptocurrency",
    parameters: httpParams({
      symbol: { type: "string", description: "Cryptocurrency symbol, e.g. BTC" },
    }),
  },
  {
    id: "historical-fx-rates",
    type: "http",
    description: "Historical foreign exchange rates between two currencies on a past date",
    parameters: httpParams({
      from: { type: "string", description: "Source currency code" },
      to: { type: "string", description: "Target currency code" },
      date: { type: "string", description: "Historical date, ISO 8601" },
    }),
  },

  // Cluster: translation / language (extends "translate")
  {
    id: "language-detect",
    type: "http",
    description: "Detect which language a piece of text is written in",
    parameters: httpParams({
      text: { type: "string", description: "Text to identify the language of" },
    }),
  },
  {
    id: "transliterate",
    type: "http",
    description:
      "Convert text from one writing script to another, preserving pronunciation, not meaning",
    parameters: httpParams({
      text: { type: "string", description: "Text to transliterate" },
      targetScript: { type: "string", description: "Target script, e.g. latin, cyrillic" },
    }),
  },
  {
    id: "grammar-check",
    type: "http",
    description: "Check and correct grammar and spelling mistakes in text, same language",
    parameters: httpParams({
      text: { type: "string", description: "Text to check" },
    }),
  },

  // Cluster: image (extends "image-generation")
  {
    id: "image-upscale",
    type: "http",
    description: "Increase the resolution of an existing image without generating new content",
    parameters: httpParams({
      image: { type: "string", description: "Base64-encoded source image" },
    }),
  },
  {
    id: "remove-background",
    type: "http",
    description: "Remove the background from an existing photo, isolating the subject",
    parameters: httpParams({
      image: { type: "string", description: "Base64-encoded source image" },
    }),
  },
  {
    id: "caption-image",
    type: "http",
    description: "Generate a text description of what appears in an existing image",
    parameters: httpParams({
      image: { type: "string", description: "Base64-encoded source image" },
    }),
  },

  // Cluster: search (extends "web-search")
  {
    id: "news-search",
    type: "http",
    description: "Search news articles and reporting, not the general web",
    parameters: httpParams({
      query: { type: "string", description: "Search terms" },
    }),
  },
  {
    id: "academic-search",
    type: "http",
    description: "Search peer-reviewed academic papers and scholarly publications",
    parameters: httpParams({
      query: { type: "string", description: "Search terms" },
    }),
  },

  // Cluster: geo (extends "geocode", "route-directions")
  {
    id: "reverse-geocode",
    type: "http",
    description: "Convert GPS coordinates back into a street address, the reverse of geocoding",
    parameters: httpParams({
      lat: { type: "number", description: "Latitude" },
      lng: { type: "number", description: "Longitude" },
    }),
  },
  {
    id: "timezone-lookup",
    type: "http",
    description: "Look up which timezone a given location observes",
    parameters: httpParams({
      city: { type: "string", description: "City or place name" },
    }),
  },
  {
    id: "distance-calc",
    type: "http",
    description:
      "Straight-line distance in miles or kilometers between two points, not turn-by-turn directions",
    parameters: httpParams({
      origin: { type: "string", description: "Starting coordinates or address" },
      destination: { type: "string", description: "Ending coordinates or address" },
    }),
  },

  // Cluster: text analysis (extends "sentiment", "summarize")
  {
    id: "keyword-extract",
    type: "http",
    description: "Extract the key terms and topics from a piece of text",
    parameters: httpParams({
      text: { type: "string", description: "Text to extract keywords from" },
    }),
  },
  {
    id: "profanity-filter",
    type: "http",
    description: "Detect offensive or toxic language in a piece of text",
    parameters: httpParams({
      text: { type: "string", description: "Text to check" },
    }),
  },

  // Cluster: communication (extends "send-email")
  {
    id: "send-sms",
    type: "http",
    description: "Send a text message to a phone number",
    parameters: httpParams({
      to: { type: "string", description: "Recipient phone number" },
      body: { type: "string", description: "Message text" },
    }),
  },
  {
    id: "send-push",
    type: "http",
    description: "Send a push notification to a mobile app's users",
    parameters: httpParams({
      title: { type: "string", description: "Notification title" },
      body: { type: "string", description: "Notification body text" },
    }),
  },
  {
    id: "verify-phone",
    type: "http",
    description: "Send a one-time verification code to a phone number and confirm it",
    parameters: httpParams({
      phone: { type: "string", description: "Phone number to verify" },
    }),
  },

  // Cluster: file / document (extends "pdf-generate", "file-storage")
  {
    id: "pdf-extract-text",
    type: "http",
    description: "Extract the plain text content out of an existing PDF document",
    parameters: httpParams({
      file: { type: "string", description: "Base64-encoded PDF file" },
    }),
  },
  {
    id: "image-to-pdf",
    type: "http",
    description: "Combine one or more images into a single PDF document",
    parameters: httpParams({
      images: { type: "string", description: "Base64-encoded image files, comma-separated" },
    }),
  },

  // Cluster: dev utilities (extends "qr-code", "url-shortener")
  {
    id: "barcode-generate",
    type: "http",
    description:
      "Generate a scannable barcode image for a product code, a different format than a QR code",
    parameters: httpParams({
      code: { type: "string", description: "Product code to encode" },
    }),
  },
  {
    id: "password-generate",
    type: "http",
    description: "Generate a strong random password",
    parameters: httpParams({
      length: { type: "number", description: "Desired password length" },
    }),
  },

  // Cluster: news (extends "sports-scores", "news-headlines")
  {
    id: "stock-market-news",
    type: "http",
    description: "Financial and stock market news, distinct from general news headlines",
    parameters: httpParams({
      ticker: { type: "string", description: "Optional ticker to filter by" },
    }),
  },

  // Cluster: MCP calendar (extends "mcp-calendar")
  {
    id: "mcp-reminder",
    type: "mcp",
    toolName: "set_reminder",
    description:
      "Set a one-time reminder for a specific time, not a calendar meeting with attendees",
    parameters: mcpParams({
      text: { type: "string", description: "What to be reminded about" },
      time: { type: "string", description: "When to be reminded, ISO 8601" },
    }),
  },
  {
    id: "mcp-timezone-convert",
    type: "mcp",
    toolName: "convert_timezone",
    description: "Convert a time from one timezone to another",
    parameters: mcpParams({
      time: { type: "string", description: "Time to convert" },
      fromZone: { type: "string", description: "Source timezone" },
      toZone: { type: "string", description: "Target timezone" },
    }),
  },

  // Cluster: MCP calculator (extends "mcp-calculator")
  {
    id: "mcp-unit-convert",
    type: "mcp",
    toolName: "convert_units",
    description: "Convert a value between measurement units, e.g. miles to kilometers",
    parameters: mcpParams({
      value: { type: "number", description: "Value to convert" },
      fromUnit: { type: "string", description: "Source unit" },
      toUnit: { type: "string", description: "Target unit" },
    }),
  },
  {
    id: "mcp-tip-calc",
    type: "mcp",
    toolName: "calculate_tip",
    description: "Calculate a tip amount and total for a restaurant bill",
    parameters: mcpParams({
      billAmount: { type: "number", description: "Bill total before tip" },
      tipPercent: { type: "number", description: "Tip percentage" },
    }),
  },

  // Cluster: MCP financial (extends "mcp-financial-analysis")
  {
    id: "mcp-crypto-analysis",
    type: "mcp",
    toolName: "analyze_crypto",
    description: "Analyze a cryptocurrency's fundamentals and on-chain metrics",
    parameters: mcpParams({
      symbol: { type: "string", description: "Cryptocurrency symbol" },
    }),
  },
  {
    id: "mcp-portfolio",
    type: "mcp",
    toolName: "portfolio_summary",
    description:
      "Summarize an entire investment portfolio's holdings and performance, across assets, not a single ticker",
    parameters: mcpParams({
      accountId: { type: "string", description: "Portfolio account identifier" },
    }),
  },

  // Cluster: travel (extends "route-directions")
  {
    id: "flight-search",
    type: "http",
    description: "Search available flights between two airports",
    parameters: httpParams({
      origin: { type: "string", description: "Origin airport code" },
      destination: { type: "string", description: "Destination airport code" },
    }),
  },
  {
    id: "transit-directions",
    type: "http",
    description: "Public transit directions by bus or train, not driving",
    parameters: httpParams({
      origin: { type: "string", description: "Starting address" },
      destination: { type: "string", description: "Ending address" },
    }),
  },
];

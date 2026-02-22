import { z } from "zod";

/** Schema for earnings call transcript data extracted from the web */
export const earningsCallSchema = z.object({
  company: z.string().describe("Company name"),
  ticker: z.string().describe("Stock ticker symbol"),
  quarter: z.string().describe("Fiscal quarter (e.g. Q1, Q2, Q3, Q4)"),
  fiscalYear: z.number().describe("Fiscal year"),
  date: z.string().describe("Date of the earnings call"),
  participants: z
    .array(
      z.object({
        name: z.string().describe("Participant name"),
        title: z.string().optional().describe("Participant title/role"),
      }),
    )
    .describe("Call participants (executives, analysts)"),
  revenue: z.string().optional().describe("Reported revenue figure"),
  eps: z.string().optional().describe("Reported earnings per share"),
  guidance: z.string().optional().describe("Forward guidance summary"),
  keyHighlights: z
    .array(z.string())
    .describe("Key highlights and takeaways from the call"),
  managementCommentary: z
    .string()
    .optional()
    .describe("Summary of management commentary"),
  qaHighlights: z
    .array(z.string())
    .optional()
    .describe("Notable Q&A exchanges"),
});

/** Schema for company profile / overview data */
export const companyProfileSchema = z.object({
  name: z.string().describe("Full company name"),
  ticker: z.string().describe("Stock ticker symbol"),
  exchange: z.string().optional().describe("Stock exchange (e.g. NYSE, NASDAQ)"),
  sector: z.string().optional().describe("Business sector"),
  industry: z.string().optional().describe("Industry classification"),
  description: z.string().describe("Company business description"),
  ceo: z.string().optional().describe("Current CEO name"),
  headquarters: z.string().optional().describe("Headquarters location"),
  founded: z.string().optional().describe("Year founded"),
  employees: z.number().optional().describe("Number of employees"),
  marketCap: z.string().optional().describe("Market capitalization"),
  website: z.string().optional().describe("Company website URL"),
  competitors: z
    .array(z.string())
    .optional()
    .describe("Key competitors"),
});

/** Schema for analyst ratings and price targets */
export const analystRatingSchema = z.object({
  ticker: z.string().describe("Stock ticker symbol"),
  analystName: z.string().optional().describe("Analyst name"),
  firm: z.string().describe("Analyst firm / brokerage"),
  rating: z
    .enum(["Strong Buy", "Buy", "Overweight", "Hold", "Underweight", "Sell", "Strong Sell"])
    .or(z.string())
    .describe("Analyst rating"),
  priceTarget: z.number().optional().describe("Price target in USD"),
  previousPriceTarget: z.number().optional().describe("Previous price target in USD"),
  date: z.string().describe("Date of the rating"),
  summary: z.string().optional().describe("Summary of the analyst's thesis"),
});

/** Schema for financial news articles */
export const newsArticleSchema = z.object({
  title: z.string().describe("Article headline"),
  source: z.string().describe("Publication or news source"),
  author: z.string().optional().describe("Author name"),
  publishedDate: z.string().describe("Publication date"),
  url: z.string().optional().describe("Article URL"),
  summary: z.string().describe("Article summary"),
  tickers: z.array(z.string()).optional().describe("Mentioned stock tickers"),
  sentiment: z
    .enum(["bullish", "bearish", "neutral", "mixed"])
    .optional()
    .describe("Overall sentiment of the article"),
  keyPoints: z
    .array(z.string())
    .optional()
    .describe("Key points from the article"),
});

/** Schema for SEC filing metadata */
export const secFilingMetaSchema = z.object({
  company: z.string().describe("Company name"),
  ticker: z.string().describe("Stock ticker symbol"),
  cik: z.string().optional().describe("SEC Central Index Key"),
  filingType: z
    .string()
    .describe("Filing type (e.g. 10-K, 10-Q, 8-K, DEF 14A, S-1)"),
  filingDate: z.string().describe("Filing date"),
  periodOfReport: z.string().optional().describe("Period covered by the filing"),
  accessionNumber: z.string().optional().describe("SEC accession number"),
  fileUrl: z.string().optional().describe("URL to the filing document"),
  description: z.string().optional().describe("Brief description of the filing contents"),
  keyItems: z
    .array(z.string())
    .optional()
    .describe("Key items or sections disclosed"),
});

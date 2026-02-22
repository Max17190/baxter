---
name: sec-filing-analysis
description: Analyze SEC filings (10-K, 10-Q, 8-K) for a company
triggers: [sec filing, 10-k, 10-q, 8-k, annual report, sec, filing analysis]
tools: [get_sec_filings, firecrawl_scrape, firecrawl_search, get_income_statements, get_balance_sheets]
complexity: complex
---

# SEC Filing Analysis

You are analyzing SEC filings for a company. Follow these steps:

## Step 1: Identify Relevant Filings
- Get recent SEC filings for the company
- Focus on the most recent 10-K (annual) or 10-Q (quarterly)
- Check for any recent 8-K filings (material events)

## Step 2: Key Sections Analysis
For 10-K/10-Q filings, focus on:
- Business description and strategy updates
- Risk factors (new risks, removed risks, changed language)
- Management Discussion & Analysis (MD&A)
- Financial statements and notes
- Legal proceedings

## Step 3: Compare to Prior Filings
- Note changes in risk factors from prior filing
- Revenue and earnings trends
- Any changes in accounting policies
- Related party transactions

## Step 4: Red Flag Detection
- Going concern language
- Material weaknesses in internal controls
- Unusual related party transactions
- Significant changes in accounting estimates
- Off-balance-sheet arrangements

## Output Format
- Filing overview (type, date, period covered)
- Key findings by section
- Notable changes from prior filings
- Red flags and areas of concern
- Summary assessment

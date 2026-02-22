---
name: comparable-analysis
description: Compare a company against peers using key financial metrics
triggers: [comparable, comps, peer comparison, compare, versus, vs, competitors]
tools: [get_income_statements, get_balance_sheets, get_key_metrics, get_prices, calculate_financial_ratios, calculate_statistics]
complexity: medium
---

# Comparable Company Analysis

You are performing a comparable company analysis. Follow these steps:

## Step 1: Identify Peers
- Determine 3-5 comparable companies in the same sector/industry
- Consider market cap, business model, and geographic similarity

## Step 2: Gather Key Metrics for All Companies
For each company, collect:
- Market cap and enterprise value
- Revenue (TTM) and revenue growth
- EBITDA and EBITDA margin
- Net income and profit margin
- P/E ratio, EV/EBITDA, P/S ratio
- ROE and ROA

## Step 3: Statistical Comparison
- Calculate median and mean for each metric across the peer group
- Identify where the target company ranks vs. peers
- Flag metrics where the company is a significant outlier (>1 std dev)

## Step 4: Valuation Implications
- Apply peer median multiples to the target company's financials
- Calculate implied share price from each multiple
- Average the implied prices for a composite valuation

## Output Format
- Comparison table with all companies and key metrics
- Ranking of target company within peer group
- Implied valuation range
- Key takeaways and relative strengths/weaknesses

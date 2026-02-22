---
name: earnings-analysis
description: Analyze a company's recent earnings report and financial performance
triggers: [earnings, quarterly results, revenue beat, eps, earnings call, financial results]
tools: [get_income_statements, get_analyst_estimates, get_key_metrics, get_prices, firecrawl_search, calculate_growth_rates]
complexity: medium
---

# Earnings Analysis

You are analyzing a company's most recent earnings. Follow these steps:

## Step 1: Get Latest Financial Data
- Get the most recent quarterly income statement
- Get analyst estimates for comparison (beat/miss analysis)
- Get the stock price movement around earnings date

## Step 2: Revenue Analysis
- Compare actual revenue to analyst estimates
- Calculate YoY and QoQ revenue growth
- Break down by segment if available

## Step 3: Profitability Analysis
- EPS vs. consensus estimate
- Gross margin, operating margin, net margin trends
- Compare to prior quarters and year-ago quarter

## Step 4: Forward Guidance
- Search for earnings call highlights and forward guidance
- Compare guidance to analyst expectations
- Note any changes in management outlook

## Step 5: Market Reaction
- Stock price change post-earnings
- Volume analysis
- Analyst rating changes

## Output Format
- Earnings scorecard (beat/meet/miss for key metrics)
- Trend analysis with YoY and QoQ comparisons
- Key quotes from earnings call
- Updated outlook assessment

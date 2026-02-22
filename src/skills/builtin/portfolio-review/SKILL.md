---
name: portfolio-review
description: Review and analyze a portfolio of stocks
triggers: [portfolio, portfolio review, holdings, allocation, diversification, rebalance]
tools: [get_prices, get_key_metrics, get_income_statements, calculate_financial_ratios, calculate_statistics, calculate_growth_rates]
complexity: complex
---

# Portfolio Review

You are reviewing a stock portfolio. Follow these steps:

## Step 1: Gather Portfolio Data
- Get current prices for all holdings
- Get key metrics (PE, market cap, dividend yield) for each
- Calculate portfolio weights

## Step 2: Performance Analysis
- Calculate individual stock returns over relevant periods (1M, 3M, YTD, 1Y)
- Calculate portfolio-weighted return
- Compare to benchmark (S&P 500)

## Step 3: Risk Analysis
- Sector concentration analysis
- Single-stock concentration risk
- Correlation between holdings
- Overall portfolio beta estimate

## Step 4: Fundamental Health Check
- Screen for red flags in any holding:
  - Negative earnings growth
  - Declining margins
  - High debt levels
  - Extreme valuations

## Step 5: Recommendations
- Identify overweight/underweight positions
- Flag holdings that may need attention
- Suggest rebalancing actions if applicable
- Diversification improvement opportunities

## Output Format
- Portfolio summary table (holding, weight, return, PE, sector)
- Performance attribution
- Risk metrics
- Action items and recommendations

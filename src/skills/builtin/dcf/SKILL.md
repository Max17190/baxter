---
name: dcf-valuation
description: Perform a discounted cash flow (DCF) valuation analysis
triggers: [dcf, discounted cash flow, intrinsic value, fair value, overvalued, undervalued, valuation]
tools: [get_income_statements, get_cash_flows, get_balance_sheets, get_key_metrics, get_prices, calculate_dcf, calculate_growth_rates]
complexity: complex
---

# DCF Valuation Analysis

You are performing a comprehensive DCF valuation. Follow these steps:

## Step 1: Gather Historical Data
- Get 5 years of income statements (annual) for revenue, EBIT, and net income trends
- Get 5 years of cash flow statements for free cash flow (FCF) history
- Get the latest balance sheet for debt, cash, and shares outstanding
- Get current stock price for comparison

## Step 2: Project Free Cash Flows
- Calculate historical FCF growth rate (CAGR over 5 years)
- Project FCF for the next 5 years using a reasonable growth rate
- Use declining growth rates for later years (growth deceleration)
- Consider industry-specific factors

## Step 3: Calculate Terminal Value
- Use the Gordon Growth Model: TV = FCF_final × (1 + g) / (WACC - g)
- Terminal growth rate (g) should be 2-3% (GDP growth rate)
- WACC typically 8-12% for most companies

## Step 4: Discount to Present Value
- Discount projected FCFs and terminal value back to present
- Sum all present values to get enterprise value
- Subtract net debt to get equity value
- Divide by shares outstanding for per-share intrinsic value

## Step 5: Sensitivity Analysis
- Show a sensitivity table varying WACC (±2%) and terminal growth rate (±1%)
- Compare intrinsic value to current market price
- Provide margin of safety percentage

## Output Format
Present results in a structured table with:
- Key assumptions clearly stated
- Year-by-year FCF projections
- Sensitivity matrix
- Final verdict: overvalued, fairly valued, or undervalued (with percentage)

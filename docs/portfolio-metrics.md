# Portfolio metrics (calculated by Ghostfolio)

This document lists the metrics calculated by Ghostfolio for the overall portfolio (global) and for each holding. It includes the main fields, time ranges used for period metrics, and references to the source files where these metrics are computed or defined.

> Note: calculations may vary depending on the selected performance calculation type (ROAI, TWR, MWR, ROI). See the calculator implementations under `apps/api/src/app/portfolio/calculator/`.

## Table of contents

- Portfolio (global) metrics
- Holding (per-position) metrics
- Time ranges / period metrics
- Calculation methods and references
- Relevant source files

## Portfolio (global) metrics

These metrics are exposed in the `PortfolioSnapshot` / `PortfolioSummary` / `PortfolioPerformance` models and computed by the portfolio calculators.

- currentValueInBaseCurrency — Current total value of the portfolio in the user's base currency
- totalInvestment — Total invested amount
- totalInvestmentWithCurrencyEffect — Total invested amount including currency effects
- netPerformance — Total net performance (absolute)
- netPerformancePercentage — Net performance expressed as a percentage
- netPerformancePercentageWithCurrencyEffect — Net performance percentage including currency effects
- netPerformanceWithCurrencyEffect — Net performance including currency effects (absolute)
- grossPerformance — Total gross performance (absolute)
- grossPerformanceWithCurrencyEffect — Gross performance including currency effects
- annualizedPerformancePercent — Annualized performance (percentage)
- annualizedPerformancePercentWithCurrencyEffect — Annualized performance including currency effects

- totalFeesWithCurrencyEffect — Total fees including currency effects
- totalInterestWithCurrencyEffect — Total interest including currency effects
- totalLiabilitiesWithCurrencyEffect — Total liabilities including currency effects

- fees — (present in some summaries) total fees
- interest — (present in summaries) total interest
- liabilities — (present in summaries) total liabilities

- cash — Cash balance included in summary
- committedFunds — Committed funds
- emergencyFund — Emergency fund breakdown (assets, cash, total)

- activitiesCount / activityCount — Number of activities / transactions
- totalBuy — Total buy amount
- totalSell — Total sell amount
- excludedAccountsAndActivities — Count of excluded accounts/activities

- currentNetWorth — Current net worth (when available)
- fireWealth — FIRE wealth estimate (when available)

## Holding (per-position) metrics

These are returned by the `PortfolioHoldingResponse` and `PortfolioPosition` / `TimelinePosition` models. Many metrics are computed per holding inside the portfolio calculator (symbol metrics).

- symbol — Asset symbol
- name — Asset name
- dataSource — Data provider/source
- currency — Asset currency
- quantity — Quantity held
- marketPrice — Current market price
- marketPriceInBaseCurrency — Market price converted to base currency
- marketPriceMax — Historical maximum market price
- marketPriceMin — Historical minimum market price
- averagePrice — Average purchase price
- firstBuyDate — Date of first buy for this holding
- transactionCount — Number of transactions for the holding

- investment — Total invested amount for the holding
- investmentWithCurrencyEffect — Investment including currency effects
- timeWeightedInvestment — Time-weighted investment (ROAI calculations)
- timeWeightedInvestmentWithCurrencyEffect — Time-weighted investment including currency effects

- value — Current value of the holding (converted if needed)
- valueInBaseCurrency — Value in base currency
- allocationInPercentage — Percent allocation of this holding inside the portfolio

- grossPerformance — Gross performance (absolute)
- grossPerformancePercent — Gross performance (percentage)
- grossPerformancePercentWithCurrencyEffect — Gross performance % including currency effects
- grossPerformanceWithCurrencyEffect — Gross performance including currency effects

- netPerformance — Net performance (absolute)
- netPerformancePercent — Net performance (percentage)
- netPerformancePercentWithCurrencyEffect — Net performance % including currency effects
- netPerformanceWithCurrencyEffect — Net performance including currency effects
- netPerformancePercentageWithCurrencyEffectMap — Map of net performance percentages by time range
- netPerformanceWithCurrencyEffectMap — Map of net performance values by time range

- dividend — Total dividend for the holding
- dividendInBaseCurrency — Dividend converted to base currency
- dividendYieldPercent — Dividend yield (annualized in some places)
- dividendYieldPercentWithCurrencyEffect — Dividend yield considering currency effects

- fee — Fees associated with the holding
- feeInBaseCurrency — Fees converted to base currency

- historicalData — Time series of historical market prices (used for charts and period metrics)
- performances — Benchmark-style performance data (e.g. all-time-high performance and date)

- tags — Tags assigned to the holding
- sectors / countries / assetClass / assetSubClass — Classification data used in position aggregation

## Time ranges / period metrics

Many per-holding and portfolio metrics are also computed for multiple predefined periods. Typical ranges used in the code:

- 1d (one day)
- wtd (week to date)
- mtd (month to date)
- ytd (year to date)
- 1y (one year)
- 5y (five years)
- max (full history)

The calculators populate maps such as `netPerformancePercentageWithCurrencyEffectMap` with keys for these ranges.

## Calculation methods

Ghostfolio supports several performance calculation types. Metrics returned depend on which calculator is selected for the user (see `CalculatorFactory` usage in `PortfolioService`):

- ROAI — Return on Average Investment (implemented in `apps/api/src/app/portfolio/calculator/roai/portfolio-calculator.ts`). This calculator computes time-weighted investments and uses them to derive percentages and absolute performance values. Symbol-level intermediate values are defined in `SymbolMetrics`.
- TWR — Time-weighted return (skeleton in `apps/api/src/app/portfolio/calculator/twr/portfolio-calculator.ts`).
- MWR — Money-weighted return / IRR (skeleton in `apps/api/src/app/portfolio/calculator/mwr/portfolio-calculator.ts`).
- ROI — Simple return on investment (skeleton in `apps/api/src/app/portfolio/calculator/roi/portfolio-calculator.ts`).

Note: not all calculators are fully implemented; ROAI contains the most extensive symbol-level implementation in this codebase.

## Relevant source files (references)

- Portfolio calculators
  - `apps/api/src/app/portfolio/calculator/portfolio-calculator.ts` — Base calculator & snapshot orchestration
  - `apps/api/src/app/portfolio/calculator/roai/portfolio-calculator.ts` — ROAI implementation (detailed symbol metrics)
  - `apps/api/src/app/portfolio/calculator/twr/portfolio-calculator.ts` — TWR (skeleton)
  - `apps/api/src/app/portfolio/calculator/mwr/portfolio-calculator.ts` — MWR (skeleton)
  - `apps/api/src/app/portfolio/calculator/roi/portfolio-calculator.ts` — ROI (skeleton)

- API surface & services
  - `apps/api/src/app/portfolio/portfolio.service.ts` — Endpoints and composition, builds `PortfolioHoldingResponse` and `PortfolioDetails`
  - `apps/api/src/app/portfolio/portfolio.controller.ts` — Routes for portfolio endpoints
  - `apps/api/src/app/portfolio/interfaces/*.ts` — Calculator-specific interfaces used internally

- Models & interfaces
  - `libs/common/src/lib/models/portfolio-snapshot.ts` — `PortfolioSnapshot` model (global snapshot fields)
  - `libs/common/src/lib/models/timeline-position.ts` — `TimelinePosition` (per position fields stored as Big)
  - `libs/common/src/lib/interfaces/responses/portfolio-holding-response.interface.ts` — `PortfolioHoldingResponse` (API response fields)
  - `libs/common/src/lib/interfaces/portfolio-performance.interface.ts` — `PortfolioPerformance` types
  - `libs/common/src/lib/interfaces/portfolio-position.interface.ts` — `PortfolioPosition` fields
  - `libs/common/src/lib/interfaces/symbol-metrics.interface.ts` — `SymbolMetrics` internal structure used by calculators

## How metrics map to code (quick pointers)

- `PortfolioHoldingResponse` fields come from `TimelinePosition` / `SymbolMetrics` values produced by the calculators. See `PortfolioService.getHolding()` for how the service maps calculator output to the response.
- Symbol-level internal values (time-weighted investments, gross/net performance, dividends, fees, etc.) are assembled inside `roai/portfolio-calculator.ts` and the `SymbolMetrics` interface.
- Global aggregates (totals, fees, interest, liabilities) are computed in the base `portfolio-calculator.ts` `calculateOverallPerformance()` implementations and returned as part of `PortfolioSnapshot`.

## Notes

- This document is an inventory-style reference. For exact formulas, inspect the implementation in `apps/api/src/app/portfolio/calculator/roai/portfolio-calculator.ts` (ROAI) and the base `portfolio-calculator.ts` file.
- Some calculators other than ROAI are stubbed (TWR, MWR, ROI) and may not yet compute all metrics.
- You asked not to fix linter errors — I haven't run linters or modified code to address warnings.

---

Generated on: 2025-09-21

Sources referenced while creating this document:

- `libs/common/src/lib/interfaces/responses/portfolio-holding-response.interface.ts`
- `libs/common/src/lib/interfaces/portfolio-performance.interface.ts`
- `libs/common/src/lib/models/portfolio-snapshot.ts`
- `libs/common/src/lib/models/timeline-position.ts`
- `libs/common/src/lib/interfaces/portfolio-position.interface.ts`
- `libs/common/src/lib/interfaces/symbol-metrics.interface.ts`
- `apps/api/src/app/portfolio/portfolio.service.ts`
- `apps/api/src/app/portfolio/calculator/portfolio-calculator.ts`
- `apps/api/src/app/portfolio/calculator/roai/portfolio-calculator.ts`

## Detailed explanations and formulas

Below are natural-language explanations for each metric listed above, followed by a concise technical formula or calculation note. Some formulas are simplified summaries; the actual implementation may include additional adjustments (currency conversion, fees at different dates, realized vs unrealized components, dividends/interest) depending on the calculator used (ROAI, TWR, MWR, ROI).

### Portfolio (global) metrics — details

- currentValueInBaseCurrency
  - The total market value of the portfolio converted into the user's base currency, including positions and cash where applicable.

    $\text{currentValueInBaseCurrency} = \sum_{i=1}^{N} \text{valueInBaseCurrency}_i + \text{cashInBaseCurrency}$

  - Technical note: each position's value is computed as (quantity \* marketPrice) and then converted using the exchange rate for the base currency. Cash and other balances are added.

- totalInvestment
  - The sum of amounts the user has put into the portfolio (aggregate of investment cash flows).

    $\text{totalInvestment} = \sum_{activities\;type=BUY} \text{amount}_{activity} - \sum_{activities\;type=SELL} \text{proceeds}_{activity}\;$

    (or aggregated as net cash flows depending on conventions)

  - Technical note: In the code this is computed from order/activity records. Some calculators report "totalInvestment" as gross invested amount (ignoring sells) while others use net cash flow conventions; refer to `portfolio-calculator` implementation for the chosen convention.

- totalInvestmentWithCurrencyEffect
  - Same as totalInvestment but converting each activity into base currency at the exchange rate effective at the activity date (so currency movements are included).

    $\sum_{activity} \text{amount}_{activity} \times \text{exchangeRate}_{activityDate}$

- netPerformance
  - Absolute profit or loss of the portfolio after fees, dividends, interest and realized/unrealized changes.

    $\text{netPerformance} \approx \text{currentValue} - \text{totalInvestment} + \text{dividends} + \text{interest} - \text{fees} - \text{liabilities}$

  - Technical note: The exact aggregation depends on the calculator; ROAI internally composes net performance from symbol-level gross performance, realized gains, and fees (see `SymbolMetrics` aggregation in `roai/portfolio-calculator.ts`). Currency effects may be included in separate fields.

- netPerformancePercentage
  - Net performance expressed as a percentage of a base (usually investment). It measures return relative to the invested capital.

    $\text{netPerformancePercentage} = \dfrac{\text{netPerformance}}{\text{denominator}} \times 100\%$

  - Technical note: The denominator can be `totalInvestment` or a time-weighted average investment depending on the performance calculation method. ROAI uses time-weighted average investment as denominator in many cases.

- netPerformancePercentageWithCurrencyEffect
  - Same as netPerformancePercentage but including currency conversion effects (i.e., amounts converted at relevant historical exchange rates).
  - Formula (conceptual): apply currency conversion to numerator and denominator before division.

- netPerformanceWithCurrencyEffect
  - Absolute net performance where each cash flow and market value is converted using appropriate historical exchange rates, therefore including FX gains/losses.

- grossPerformance
  - Profit or loss before subtracting fees (and sometimes before adding dividends/interest). It represents market-driven gains (realized + unrealized) excluding transactional costs.

    $\text{grossPerformance} = \text{currentMarketValue} - \text{initialValue} + \text{realizedGains}$

  - Technical note: Implementations aggregate symbol-level grossPerformance values to compute overall grossPerformance.

- grossPerformanceWithCurrencyEffect
  - Gross performance computed after converting market values and cash flows to base currency at historical rates, so FX impact is reflected.

- annualizedPerformancePercent
  - The geometric annualized return that, when compounded over the elapsed years, equals the observed total return.

    $\text{annualized} = (1 + R)^{1/T} - 1$

    where $R$ is total return (e.g., netPerformance / base) and $T$ is time in years.

  - Technical note: When there are multiple cash flows, true annualized return requires an IRR or time-weighted / money-weighted conversion. The simple formula above applies for a single-period total return.

- annualizedPerformancePercentWithCurrencyEffect
  - Annualized performance calculated using values converted with historical exchange rates (FX included).

- totalFeesWithCurrencyEffect
  - Sum of all fees paid, converted into base currency using activity-date exchange rates.

    $\sum_{fees\;activity} fee_{activity} \times exchangeRate_{activityDate}$

- totalInterestWithCurrencyEffect
  - Sum of interest amounts (e.g., from cash accounts or bonds) converted to base currency at the corresponding dates.

- totalLiabilitiesWithCurrencyEffect
  - Sum of liabilities (margin loans, short positions, etc.) converted to base currency at appropriate rates.

- fees / interest / liabilities / cash / committedFunds / emergencyFund
  - Aggregated numeric sums corresponding to each category. Computed by summing the corresponding transactions or account balances and converting to base currency where relevant.

- activitiesCount / activityCount
  - The total number of portfolio activities (orders, deposits, withdrawals, dividends, etc.).

- totalBuy / totalSell
  - Aggregated monetary volume of buy and sell activities respectively.

- excludedAccountsAndActivities
  - Count or aggregated amount of accounts and activities excluded by filters.

- currentNetWorth
  - The user's net worth at the current time, when available in summary (may combine non-portfolio assets as well).

- fireWealth
  - A computed estimate of the wealth required for FIRE (Financial Independence) planning, based on portfolio and cash assumptions.

### Holding (per-position) metrics — details

- symbol / name / dataSource / currency
  - Identifiers and metadata for the holding (no numeric calculation).

- quantity
  - Net units held of the asset (buys minus sells).

    $\text{quantity} = \sum_{buy} q_{buy} - \sum_{sell} q_{sell}$

- marketPrice
  - Latest unit price quoted for the asset from the data provider.

- marketPriceInBaseCurrency
  - marketPrice converted to the user's base currency using the latest applicable exchange rate.

- marketPriceMax / marketPriceMin
  - Historical maximum and minimum market prices observed within the available historical data window.

- averagePrice
  - Weighted average price paid per unit (ignoring fees unless specifically included).

    $\text{averagePrice} = \dfrac{\sum_{buys} (price_i \times qty_i)}{\sum_{buys} qty_i}$

  - Technical note: Some implementations include sell-adjustments or realized-gain accounting; the service builds this using activity history.

- firstBuyDate
  - Date of the first purchase activity for the holding.

- transactionCount
  - Number of activities related to the holding.

- investment
  - Amount of money invested into this holding (in asset currency or base currency depending on field) derived from relevant buy orders.

    $\text{investment} = \sum_{buys} (price_i \times qty_i)$ (converted to base currency when appropriate).

- investmentWithCurrencyEffect
  - Investment amount taking into account historical exchange rates for each activity.

- timeWeightedInvestment
  - Average invested capital weighted by time (used by ROAI / time-weighted calculations to normalize returns when cash flows happen at different times).
  - Formula (as implemented conceptually in ROAI):

    $\text{timeWeightedAverage} = \dfrac{\sum_{d \in days} \text{investmentOnDay}_d}{\text{totalInvestmentDays}}$

  - Technical note: ROAI accumulates time-weighted contributions per day (or per transaction period) and divides by the total number of investment-days.

- timeWeightedInvestmentWithCurrencyEffect
  - Time-weighted investment with each day's values converted to base currency using the appropriate FX rate.

- value / valueInBaseCurrency
  - Current market value of the holding (quantity \* marketPrice) and the same converted to base currency.

    $\text{value} = \text{quantity} \times \text{marketPrice}$

- allocationInPercentage
  - Share of this holding's value in the context of the whole portfolio.

    $\text{allocation\%} = \dfrac{\text{valueInBaseCurrency}}{\text{currentValueInBaseCurrency}} \times 100\%$

- grossPerformance
  - Holding-level gain or loss before deducting fees and (optionally) before including dividends/interest.

    $\text{grossPerformance} = \text{currentValue} + \text{proceedsFromSells} - \text{costBasis}$

  - Technical note: cost basis is derived from the historical buys; sells reduce quantity and may generate realized gains included in grossPerformance.

- grossPerformancePercent
  - Gross performance divided by the chosen investment base (cost basis or time-weighted base depending on method).

    $\dfrac{\text{grossPerformance}}{\text{investment}} \times 100\%$

- grossPerformancePercentWithCurrencyEffect
  - Gross performance percentage after applying FX conversions to numerator and denominator.

- grossPerformanceWithCurrencyEffect
  - Gross performance measured in base currency using historical FX rates.

- netPerformance
  - Gross performance adjusted by fees and including dividend/interest effects (i.e., what the investor actually pocketed or lost).

    $\text{netPerformance} = \text{grossPerformance} - \text{fees} + \text{dividends} + \text{interest} - \text{liabilities}$

  - Technical note: In ROAI the netPerformance is further normalized into time-weighted percentages; consult `roai/portfolio-calculator.ts` for the exact aggregation steps.

- netPerformancePercent
  - Net performance expressed as a percentage of the investment base.

    $\dfrac{\text{netPerformance}}{\text{denominator}} \times 100\%$

    (denominator is either `investment` or a time-weighted average investment depending on calculation mode)

- netPerformancePercentWithCurrencyEffect / netPerformanceWithCurrencyEffect
  - Net performance metrics computed after converting values using historical FX rates. The percent form divides converted netPerformance by converted base (investment or time-weighted base).

- netPerformancePercentageWithCurrencyEffectMap / netPerformanceWithCurrencyEffectMap
  - Mapped net performance values and percentages per predefined date ranges (1d, wtd, mtd, ytd, 1y, 5y, max). Each entry is computed the same way as the 'max' metric but limited to the period.

- dividend / dividendInBaseCurrency
  - Sum of dividends received for the holding (and converted to base currency when required).

    $\sum_{dividend\;activity} amount_{dividend} \times exchangeRate_{dividendDate}$

- dividendYieldPercent
  - Annualized dividend income divided by current market value (expressed as a percentage).

    $\dfrac{\text{annualizedDividends}}{\text{currentMarketValue}} \times 100\%$

  - Technical note: Annualization is commonly done by scaling observed dividends by days-in-market or using trailing-12-month (TTM) dividends.

- fee / feeInBaseCurrency
  - Fees paid for orders / custody / other services related to the holding, converted to base currency if shown as such.

- historicalData
  - Time series of market prices (and sometimes derived values) used for charts and period calculations. No single formula — it's raw series data.

- performances
  - Pre-computed benchmark-style performance items such as all-time-high return and the date when it occurred.

- tags / sectors / countries / assetClass / assetSubClass
  - Metadata and classification fields used for grouping and reporting; not numeric calculations per se.

## Implementation pointers and caveats

- ROAI-specific notes: ROAI calculates time-weighted average investment by accumulating per-day (or per-transaction-interval) investments and dividing by total investment-days. Many percentage metrics in ROAI use this time-weighted denominator instead of raw totalInvestment.
- Currency effects: Fields ending with `WithCurrencyEffect` indicate that historical FX rates were applied to cash flows and values to show the impact of exchange rate movements separately from market price moves.
- Realized vs unrealized: Gross and net performance fields aggregate realized and unrealized components; exact treatment of sells (proceeds vs. reduction of cost basis) is implemented in the calculator.

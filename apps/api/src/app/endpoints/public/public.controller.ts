import { AccessService } from '@ghostfolio/api/app/access/access.service';
import { OrderService } from '@ghostfolio/api/app/order/order.service';
import { PortfolioService } from '@ghostfolio/api/app/portfolio/portfolio.service';
import { UserService } from '@ghostfolio/api/app/user/user.service';
import { TransformDataSourceInResponseInterceptor } from '@ghostfolio/api/interceptors/transform-data-source-in-response/transform-data-source-in-response.interceptor';
import { ConfigurationService } from '@ghostfolio/api/services/configuration/configuration.service';
import { ExchangeRateDataService } from '@ghostfolio/api/services/exchange-rate-data/exchange-rate-data.service';
import { DEFAULT_CURRENCY } from '@ghostfolio/common/config';
import { getSum } from '@ghostfolio/common/helper';
import { PublicPortfolioResponse } from '@ghostfolio/common/interfaces';

import {
  Controller,
  Get,
  HttpException,
  Param,
  UseInterceptors
} from '@nestjs/common';
import { Big } from 'big.js';
import { StatusCodes, getReasonPhrase } from 'http-status-codes';

@Controller('public')
export class PublicController {
  public constructor(
    private readonly accessService: AccessService,
    private readonly configurationService: ConfigurationService,
    private readonly exchangeRateDataService: ExchangeRateDataService,
    private readonly orderService: OrderService,
    private readonly portfolioService: PortfolioService,
    private readonly userService: UserService
  ) {}

  @Get(':accessId/portfolio')
  @UseInterceptors(TransformDataSourceInResponseInterceptor)
  public async getPublicPortfolio(
    @Param('accessId') accessId
  ): Promise<PublicPortfolioResponse> {
    const access = await this.accessService.access({ id: accessId });

    if (!access) {
      throw new HttpException(
        getReasonPhrase(StatusCodes.NOT_FOUND),
        StatusCodes.NOT_FOUND
      );
    }

    let hasDetails = true;

    const user = await this.userService.user({
      id: access.userId
    });

    if (this.configurationService.get('ENABLE_FEATURE_SUBSCRIPTION')) {
      hasDetails = user.subscription.type === 'Premium';
    }

    // Check if this is READ_RESTRICTED_EXTENDED permission early
    const isRestrictedExtended = access.permissions.includes(
      'READ_RESTRICTED_EXTENDED'
    );

    // Create account filters if accountIds are specified in access
    const accountFilters =
      (access as any).accountIds && (access as any).accountIds.length > 0
        ? (access as any).accountIds.map((accountId) => ({
            id: accountId,
            type: 'ACCOUNT' as const
          }))
        : undefined;

    const portfolioDetailsOptions = {
      impersonationId: access.userId,
      userId: user.id,
      withMarkets: true,
      ...(accountFilters && { filters: accountFilters })
    };

    const [
      portfolioDetails,
      performance1dResult,
      performanceMaxResult,
      performanceYtdResult,
      activitiesResult
    ] = await Promise.all([
      this.portfolioService.getDetails(portfolioDetailsOptions),
      ...(['1d', 'max', 'ytd'] as const).map((dateRange) => {
        return this.portfolioService.getPerformance({
          dateRange,
          impersonationId: undefined,
          userId: user.id
        });
      }),
      this.orderService.getOrders({
        includeDrafts: false,
        sortColumn: 'date',
        sortDirection: 'desc',
        take: isRestrictedExtended ? undefined : 10,
        userCurrency: user.settings?.settings.baseCurrency ?? DEFAULT_CURRENCY,
        userId: access.userId,
        withExcludedAccountsAndActivities: false
      })
    ]);

    const { createdAt, holdings, markets } = portfolioDetails;
    const { performance: performance1d } = performance1dResult as any;
    const { performance: performanceMax } = performanceMaxResult as any;
    const { performance: performanceYtd } = performanceYtdResult as any;
    const { activities } = activitiesResult as any;

    Object.values(markets ?? {}).forEach((market) => {
      delete market.valueInBaseCurrency;
    });

    // Transform activities to match PR #5538 format
    const latestActivities = activities.map((a) => ({
      account: a.account
        ? {
            currency: a.account.currency,
            name: a.account.name,
            platform: a.account.platform
          }
        : undefined,
      currency: a.currency,
      date: a.date,
      fee: a.fee,
      quantity: a.quantity,
      SymbolProfile: a.SymbolProfile,
      type: a.type,
      unitPrice: a.unitPrice,
      value: a.value,
      valueInBaseCurrency: a.valueInBaseCurrency
    }));

    const publicPortfolioResponse: PublicPortfolioResponse = {
      latestActivities: isRestrictedExtended
        ? latestActivities
        : latestActivities.slice(0, 10), // New format compatible with PR #5538
      createdAt,
      hasDetails,
      markets,
      alias: access.alias,
      holdings: {},
      performance: {
        '1d': {
          relativeChange:
            performance1d.netPerformancePercentageWithCurrencyEffect
        },
        max: {
          relativeChange:
            performanceMax.netPerformancePercentageWithCurrencyEffect
        },
        ytd: {
          relativeChange:
            performanceYtd.netPerformancePercentageWithCurrencyEffect
        }
      },
      // Add extended metrics for READ_RESTRICTED_EXTENDED access
      extendedMetrics: isRestrictedExtended
        ? {
            totalInvestmentWithCurrencyEffect: performanceMax.totalInvestment,
            currentValueInBaseCurrency:
              performanceMax.currentValueInBaseCurrency,
            netPerformanceWithCurrencyEffect:
              performanceMax.netPerformanceWithCurrencyEffect,
            netPerformancePercentageWithCurrencyEffect:
              performanceMax.netPerformancePercentageWithCurrencyEffect
          }
        : undefined
    };

    const baseCurrency =
      user.settings?.settings.baseCurrency ?? DEFAULT_CURRENCY;

    const totalValue = getSum(
      Object.entries(holdings)
        .filter(([symbol]) => symbol !== baseCurrency) // Exclude base currency from total calculation
        .map(([, { currency, marketPrice, quantity }]) => {
          return new Big(
            this.exchangeRateDataService.toCurrency(
              quantity * marketPrice,
              currency,
              baseCurrency
            )
          );
        })
    ).toNumber();

    for (const [symbol, portfolioPosition] of Object.entries(holdings)) {
      // For READ_RESTRICTED_EXTENDED, show all holding fields like in private view
      if (isRestrictedExtended) {
        publicPortfolioResponse.holdings[symbol] = {
          ...portfolioPosition,
          allocationInPercentage:
            portfolioPosition.valueInBaseCurrency / totalValue,
          valueInPercentage: portfolioPosition.valueInBaseCurrency / totalValue
        };
      } else {
        // For READ_RESTRICTED (non-extended), apply manual redacting
        const shouldRedact = !hasDetails;
        publicPortfolioResponse.holdings[symbol] = {
          allocationInPercentage:
            portfolioPosition.valueInBaseCurrency / totalValue,
          assetClass: hasDetails ? portfolioPosition.assetClass : undefined,
          countries: hasDetails ? portfolioPosition.countries : [],
          currency: hasDetails ? portfolioPosition.currency : undefined,
          dataSource: portfolioPosition.dataSource,
          dateOfFirstActivity: portfolioPosition.dateOfFirstActivity,
          markets: hasDetails ? portfolioPosition.markets : undefined,
          name: portfolioPosition.name,
          netPerformancePercentWithCurrencyEffect:
            portfolioPosition.netPerformancePercentWithCurrencyEffect,
          sectors: hasDetails ? portfolioPosition.sectors : [],
          symbol: portfolioPosition.symbol,
          url: portfolioPosition.url,
          valueInPercentage: portfolioPosition.valueInBaseCurrency / totalValue,
          // Conditionally redact sensitive values for non-extended access
          ...(shouldRedact && {
            // These values should be null for restricted view
            balance: null,
            balanceInBaseCurrency: null,
            convertedBalance: null,
            dividendInBaseCurrency: null,
            fee: null,
            feeInBaseCurrency: null,
            grossPerformance: null,
            grossPerformanceWithCurrencyEffect: null,
            interestInBaseCurrency: null,
            investment: null,
            netPerformance: null,
            netPerformanceWithCurrencyEffect: null,
            quantity: null,
            totalBalanceInBaseCurrency: null,
            totalDividendInBaseCurrency: null,
            totalInterestInBaseCurrency: null,
            totalValueInBaseCurrency: null,
            unitPrice: null,
            unitPriceInAssetProfileCurrency: null,
            value: null,
            valueInBaseCurrency: null
          })
        };
      }
    }

    return publicPortfolioResponse;
  }
}

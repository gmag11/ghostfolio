import { AccessService } from '@ghostfolio/api/app/access/access.service';
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

    const performanceOptions = (dateRange: string) => ({
      dateRange,
      impersonationId: undefined,
      userId: user.id,
      ...(accountFilters && { filters: accountFilters })
    });

    const [
      portfolioDetails,
      performance1dResult,
      performanceMaxResult,
      performanceYtdResult
    ] = await Promise.all([
      this.portfolioService.getDetails(portfolioDetailsOptions),
      ...['1d', 'max', 'ytd'].map((dateRange) => {
        return this.portfolioService.getPerformance(
          performanceOptions(dateRange)
        );
      })
    ]);

    const { createdAt, holdings, markets } = portfolioDetails;
    const { performance: performance1d } = performance1dResult as any;
    const { performance: performanceMax } = performanceMaxResult as any;
    const { performance: performanceYtd } = performanceYtdResult as any;

    Object.values(markets ?? {}).forEach((market) => {
      delete market.valueInBaseCurrency;
    });

    const publicPortfolioResponse: PublicPortfolioResponse = {
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
      }
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
      // Exclude base currency (USD) from public portfolio holdings
      const baseCurrency =
        user.settings?.settings.baseCurrency ?? DEFAULT_CURRENCY;
      if (symbol === baseCurrency) {
        continue;
      }

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
        valueInPercentage: portfolioPosition.valueInBaseCurrency / totalValue
      };
    }

    return publicPortfolioResponse;
  }
}

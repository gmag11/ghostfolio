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
import type { RequestWithUser } from '@ghostfolio/common/types';

import {
  Controller,
  Get,
  HttpException,
  Inject,
  Param,
  UseInterceptors
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Type as ActivityType } from '@prisma/client';
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
    @Inject(REQUEST) private readonly request: RequestWithUser,
    private readonly userService: UserService
  ) {}

  @Get(':accessId/portfolio')
  @UseInterceptors(TransformDataSourceInResponseInterceptor)
  public async getPublicPortfolio(
    @Param('accessId') accessId: string
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

    const isExtendedView = access.permissions.includes(
      'READ_RESTRICTED_EXTENDED' as any
    );

    const [
      { createdAt, holdings, markets },
      { performance: performance1d },
      { performance: performanceMax },
      { performance: performanceYtd }
    ] = await Promise.all([
      this.portfolioService.getDetails({
        impersonationId: access.userId,
        userId: user.id,
        withMarkets: true
      }),
      ...['1d', 'max', 'ytd'].map((dateRange) => {
        return this.portfolioService.getPerformance({
          dateRange,
          impersonationId: undefined,
          userId: user.id
        });
      })
    ]);

    const { activities } = await this.orderService.getOrders({
      includeDrafts: false,
      sortColumn: 'date',
      sortDirection: 'desc',
      take: isExtendedView ? undefined : 10,
      types: [ActivityType.BUY, ActivityType.SELL],
      userCurrency: user.settings?.settings.baseCurrency ?? DEFAULT_CURRENCY,
      userId: access.userId,
      withExcludedAccountsAndActivities: false
    });

    const processedActivities = activities.map((activity) => {
      if (isExtendedView) {
        return {
          account: activity.account
            ? {
                currency: activity.account.currency,
                name: activity.account.name,
                platform: activity.account.platform
              }
            : null,
          comment: activity.comment || null,
          currency: activity.currency,
          date: activity.date,
          fee: activity.fee,
          quantity: activity.quantity,
          SymbolProfile: activity.SymbolProfile,
          type: activity.type,
          unitPrice: activity.unitPrice,
          value: activity.value,
          valueInBaseCurrency: activity.valueInBaseCurrency
        };
      }

      return {
        currency: activity.currency,
        date: activity.date,
        fee: null,
        quantity: null,
        SymbolProfile: activity.SymbolProfile,
        type: activity.type,
        unitPrice: null,
        value: null,
        valueInBaseCurrency: null
      };
    });

    const latestActivities = this.configurationService.get(
      'ENABLE_FEATURE_SUBSCRIPTION'
    )
      ? []
      : processedActivities;

    Object.values(markets ?? {}).forEach((market) => {
      delete market.valueInBaseCurrency;
    });

    const publicPortfolioResponse: PublicPortfolioResponse = {
      createdAt,
      hasDetails,
      latestActivities,
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

    // Add summary data for extended view
    if (isExtendedView) {
      publicPortfolioResponse.summary = {
        totalInvestment: performanceMax.totalInvestment,
        currentValue: performanceMax.currentValueInBaseCurrency,
        netPerformance: performanceMax.netPerformance
      };
    }

    const totalValue = getSum(
      Object.values(holdings).map(({ currency, marketPrice, quantity }) => {
        return new Big(
          this.exchangeRateDataService.toCurrency(
            quantity * marketPrice,
            currency,
            this.request.user?.settings?.settings.baseCurrency ??
              DEFAULT_CURRENCY
          )
        );
      })
    ).toNumber();

    for (const [symbol, portfolioPosition] of Object.entries(holdings)) {
      if (isExtendedView) {
        publicPortfolioResponse.holdings[symbol] = {
          allocationInPercentage:
            portfolioPosition.valueInBaseCurrency / totalValue,
          assetClass: portfolioPosition.assetClass,
          averagePrice: hasDetails ? portfolioPosition.averagePrice : undefined,
          countries: portfolioPosition.countries,
          currency: portfolioPosition.currency,
          dataSource: portfolioPosition.dataSource,
          dateOfFirstActivity: portfolioPosition.dateOfFirstActivity,
          grossPerformance: portfolioPosition.grossPerformance,
          investment: portfolioPosition.investment,
          markets: portfolioPosition.markets,
          name: portfolioPosition.name,
          netPerformance: portfolioPosition.netPerformance,
          netPerformancePercentWithCurrencyEffect:
            portfolioPosition.netPerformancePercentWithCurrencyEffect,
          netPerformanceWithCurrencyEffect:
            portfolioPosition.netPerformanceWithCurrencyEffect,
          quantity: portfolioPosition.quantity,
          sectors: portfolioPosition.sectors,
          symbol: portfolioPosition.symbol,
          url: portfolioPosition.url,
          valueInBaseCurrency: portfolioPosition.valueInBaseCurrency,
          valueInPercentage: portfolioPosition.valueInBaseCurrency / totalValue
        };
      } else {
        publicPortfolioResponse.holdings[symbol] = {
          allocationInPercentage:
            portfolioPosition.valueInBaseCurrency / totalValue,
          assetClass: hasDetails ? portfolioPosition.assetClass : undefined,
          averagePrice: hasDetails ? portfolioPosition.averagePrice : undefined,
          countries: hasDetails ? portfolioPosition.countries : [],
          currency: hasDetails ? portfolioPosition.currency : undefined,
          dataSource: portfolioPosition.dataSource,
          dateOfFirstActivity: portfolioPosition.dateOfFirstActivity,
          grossPerformance: undefined,
          investment: undefined,
          markets: hasDetails ? portfolioPosition.markets : undefined,
          name: portfolioPosition.name,
          netPerformance: undefined,
          netPerformancePercentWithCurrencyEffect:
            portfolioPosition.netPerformancePercentWithCurrencyEffect,
          netPerformanceWithCurrencyEffect: undefined,
          quantity: undefined,
          sectors: hasDetails ? portfolioPosition.sectors : [],
          symbol: portfolioPosition.symbol,
          url: portfolioPosition.url,
          valueInBaseCurrency: undefined,
          valueInPercentage: portfolioPosition.valueInBaseCurrency / totalValue
        };
      }
    }

    return publicPortfolioResponse;
  }
}

import { AccessService } from '@ghostfolio/api/app/access/access.service';
import { Activity } from '@ghostfolio/api/app/order/interfaces/activities.interface';
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

    const [
      portfolioDetails,
      performance1dResult,
      performanceMaxResult,
      performanceYtdResult,
      activitiesResult
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
      }),
      this.orderService.getOrders({
        userId: access.userId,
        userCurrency: user.settings?.settings.baseCurrency ?? DEFAULT_CURRENCY,
        take: access.permissions.includes('READ_RESTRICTED_EXTENDED')
          ? undefined
          : 10,
        sortColumn: 'date',
        sortDirection: 'desc'
      })
    ]);

    const { createdAt, holdings, markets } = portfolioDetails;
    const { performance: performance1d } = performance1dResult as any;
    const { performance: performanceMax } = performanceMaxResult as any;
    const { performance: performanceYtd } = performanceYtdResult as any;
    const { activities } = activitiesResult as any;

    // Check if this is READ_RESTRICTED_EXTENDED permission
    const isRestrictedExtended = access.permissions.includes(
      'READ_RESTRICTED_EXTENDED'
    );

    Object.values(markets ?? {}).forEach((market) => {
      delete market.valueInBaseCurrency;
    });

    const publicPortfolioResponse: PublicPortfolioResponse = {
      activities: isRestrictedExtended ? activities : activities.slice(0, 10), // Get all activities for extended or only the last 10 for restricted
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

    // Feature flag intentionally always false to hide sensitive fields like
    // account and notes/comment in activities when returning public portfolio
    // responses. Keep the code path so it can be re-enabled later by setting
    // the flag to true.
    const SHOW_ACCOUNT_AND_NOTES_FOR_PUBLIC = false;
    const SHOW_EXTENDED_DATA_FOR_RESTRICTED_EXTENDED = isRestrictedExtended;

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
      // For READ_RESTRICTED_EXTENDED, show all holding fields like in private view
      if (SHOW_EXTENDED_DATA_FOR_RESTRICTED_EXTENDED) {
        publicPortfolioResponse.holdings[symbol] = {
          ...portfolioPosition,
          allocationInPercentage:
            portfolioPosition.valueInBaseCurrency / totalValue,
          valueInPercentage: portfolioPosition.valueInBaseCurrency / totalValue
        };
      } else {
        // Original restricted logic
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
    }
    // If activities exist, map them into the public response but strip out
    // account and comment fields unless the feature flag is enabled.
    if (activities && Array.isArray(activities)) {
      const activitiesToProcess = isRestrictedExtended
        ? activities
        : activities.slice(0, 10);

      publicPortfolioResponse.activities = activitiesToProcess.map((act) => {
        if (
          SHOW_ACCOUNT_AND_NOTES_FOR_PUBLIC ||
          SHOW_EXTENDED_DATA_FOR_RESTRICTED_EXTENDED
        ) {
          return act;
        }

        // Create a shallow copy and remove potentially sensitive fields
        const rest = { ...act };
        delete (rest as any).account;
        delete (rest as any).comment;
        return rest as Activity;
      });
    }

    return publicPortfolioResponse;
  }
}

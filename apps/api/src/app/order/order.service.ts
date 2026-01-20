import { AccountBalanceService } from '@ghostfolio/api/app/account-balance/account-balance.service';
import { AccountService } from '@ghostfolio/api/app/account/account.service';
import { CashDetails } from '@ghostfolio/api/app/account/interfaces/cash-details.interface';
import { UserService } from '@ghostfolio/api/app/user/user.service';
import { AssetProfileChangedEvent } from '@ghostfolio/api/events/asset-profile-changed.event';
import { PortfolioChangedEvent } from '@ghostfolio/api/events/portfolio-changed.event';
import { LogPerformance } from '@ghostfolio/api/interceptors/performance-logging/performance-logging.interceptor';
import { DataProviderService } from '@ghostfolio/api/services/data-provider/data-provider.service';
import { ExchangeRateDataService } from '@ghostfolio/api/services/exchange-rate-data/exchange-rate-data.service';
import { PrismaService } from '@ghostfolio/api/services/prisma/prisma.service';
import { DataGatheringService } from '@ghostfolio/api/services/queues/data-gathering/data-gathering.service';
import { SymbolProfileService } from '@ghostfolio/api/services/symbol-profile/symbol-profile.service';
import {
  DATA_GATHERING_QUEUE_PRIORITY_HIGH,
  GATHER_ASSET_PROFILE_PROCESS_JOB_NAME,
  GATHER_ASSET_PROFILE_PROCESS_JOB_OPTIONS,
  ghostfolioPrefix,
  TAG_ID_EXCLUDE_FROM_ANALYSIS
} from '@ghostfolio/common/config';
import { getAssetProfileIdentifier } from '@ghostfolio/common/helper';
import {
  ActivitiesResponse,
  Activity,
  AssetProfileIdentifier,
  EnhancedSymbolProfile,
  Filter
} from '@ghostfolio/common/interfaces';
import { OrderWithAccount } from '@ghostfolio/common/types';

import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import {
  AssetClass,
  AssetSubClass,
  DataSource,
  Order,
  Prisma,
  Tag,
  Type as ActivityType
} from '@prisma/client';
import axios from 'axios';
import { Big } from 'big.js';
import { isUUID } from 'class-validator';
import { endOfToday, isAfter } from 'date-fns';
import { groupBy, uniqBy } from 'lodash';
import { randomUUID } from 'node:crypto';

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);
  private pendingCallbacks = new Map<
    string,
    { orderId: string; operation: 'create' | 'update' | 'delete' }[]
  >();

  public constructor(
    private readonly accountBalanceService: AccountBalanceService,
    private readonly accountService: AccountService,
    private readonly dataGatheringService: DataGatheringService,
    private readonly dataProviderService: DataProviderService,
    private readonly eventEmitter: EventEmitter2,
    private readonly exchangeRateDataService: ExchangeRateDataService,
    private readonly prismaService: PrismaService,
    private readonly symbolProfileService: SymbolProfileService,
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService
  ) {}

  @OnEvent('asset.profile.gathered')
  async handleAssetProfileGathered(payload: {
    dataSource: DataSource;
    symbol: string;
  }) {
    await this.processPendingCallbacks(payload.dataSource, payload.symbol);
  }

  public async assignTags({
    dataSource,
    symbol,
    tags,
    userId
  }: { tags: Tag[]; userId: string } & AssetProfileIdentifier) {
    const orders = await this.prismaService.order.findMany({
      where: {
        userId,
        SymbolProfile: {
          dataSource,
          symbol
        }
      }
    });

    await Promise.all(
      orders.map(({ id }) =>
        this.prismaService.order.update({
          data: {
            tags: {
              // The set operation replaces all existing connections with the provided ones
              set: tags.map((tag) => {
                return { id: tag.id };
              })
            }
          },
          where: { id }
        })
      )
    );

    this.eventEmitter.emit(
      PortfolioChangedEvent.getName(),
      new PortfolioChangedEvent({
        userId
      })
    );
  }

  public async createOrder(
    data: Prisma.OrderCreateInput & {
      accountId?: string;
      assetClass?: AssetClass;
      assetSubClass?: AssetSubClass;
      currency?: string;
      symbol?: string;
      tags?: { id: string }[];
      updateAccountBalance?: boolean;
      userId: string;
    }
  ): Promise<Order> {
    let account: Prisma.AccountCreateNestedOneWithoutActivitiesInput;

    if (data.accountId) {
      account = {
        connect: {
          id_userId: {
            userId: data.userId,
            id: data.accountId
          }
        }
      };
    }

    const accountId = data.accountId;
    const tags = data.tags ?? [];
    const updateAccountBalance = data.updateAccountBalance ?? false;
    const userId = data.userId;

    if (
      ['FEE', 'INTEREST', 'LIABILITY'].includes(data.type) ||
      (data.SymbolProfile.connectOrCreate.create.dataSource === 'MANUAL' &&
        data.type === 'BUY')
    ) {
      const assetClass = data.assetClass;
      const assetSubClass = data.assetSubClass;
      const dataSource: DataSource = 'MANUAL';

      let name = data.SymbolProfile.connectOrCreate.create.name;
      let symbol: string;

      if (
        data.SymbolProfile.connectOrCreate.create.symbol.startsWith(
          `${ghostfolioPrefix}_`
        ) ||
        isUUID(data.SymbolProfile.connectOrCreate.create.symbol)
      ) {
        // Connect custom asset profile (clone)
        symbol = data.SymbolProfile.connectOrCreate.create.symbol;
      } else {
        // Create custom asset profile
        name = name ?? data.SymbolProfile.connectOrCreate.create.symbol;
        symbol = randomUUID();
      }

      data.SymbolProfile.connectOrCreate.create.assetClass = assetClass;
      data.SymbolProfile.connectOrCreate.create.assetSubClass = assetSubClass;
      data.SymbolProfile.connectOrCreate.create.dataSource = dataSource;
      data.SymbolProfile.connectOrCreate.create.name = name;
      data.SymbolProfile.connectOrCreate.create.symbol = symbol;
      data.SymbolProfile.connectOrCreate.create.userId = userId;
      data.SymbolProfile.connectOrCreate.where.dataSource_symbol = {
        dataSource,
        symbol
      };
    }

    if (data.SymbolProfile.connectOrCreate.create.dataSource !== 'MANUAL') {
      this.dataGatheringService.addJobToQueue({
        data: {
          dataSource: data.SymbolProfile.connectOrCreate.create.dataSource,
          symbol: data.SymbolProfile.connectOrCreate.create.symbol
        },
        name: GATHER_ASSET_PROFILE_PROCESS_JOB_NAME,
        opts: {
          ...GATHER_ASSET_PROFILE_PROCESS_JOB_OPTIONS,
          jobId: getAssetProfileIdentifier({
            dataSource: data.SymbolProfile.connectOrCreate.create.dataSource,
            symbol: data.SymbolProfile.connectOrCreate.create.symbol
          }),
          priority: DATA_GATHERING_QUEUE_PRIORITY_HIGH
        }
      });
    }

    delete data.accountId;
    delete data.assetClass;
    delete data.assetSubClass;

    if (!data.comment) {
      delete data.comment;
    }

    delete data.symbol;
    delete data.tags;
    delete data.updateAccountBalance;
    delete data.userId;

    const orderData: Prisma.OrderCreateInput = data;

    const isDraft = ['FEE', 'INTEREST', 'LIABILITY'].includes(data.type)
      ? false
      : isAfter(data.date as Date, endOfToday());

    const order = await this.prismaService.order.create({
      data: {
        ...orderData,
        account,
        isDraft,
        tags: {
          connect: tags
        }
      },
      include: { SymbolProfile: true }
    });

    if (updateAccountBalance === true) {
      let amount = new Big(data.unitPrice)
        .mul(data.quantity)
        .plus(data.fee)
        .toNumber();

      if (['BUY', 'FEE'].includes(data.type)) {
        amount = new Big(amount).mul(-1).toNumber();
      }

      await this.accountService.updateAccountBalance({
        accountId,
        amount,
        userId,
        currency: data.SymbolProfile.connectOrCreate.create.currency,
        date: data.date as Date
      });
    }

    this.eventEmitter.emit(
      AssetProfileChangedEvent.getName(),
      new AssetProfileChangedEvent({
        currency: order.SymbolProfile.currency,
        dataSource: order.SymbolProfile.dataSource,
        symbol: order.SymbolProfile.symbol
      })
    );

    this.eventEmitter.emit(
      PortfolioChangedEvent.getName(),
      new PortfolioChangedEvent({
        userId: order.userId
      })
    );

    // Check if SymbolProfile has complete data before sending callback
    const hasCompleteData =
      order.SymbolProfile?.name || order.SymbolProfile?.dataSource === 'MANUAL';

    if (hasCompleteData) {
      // Send callback immediately if data is complete
      this.sendActivityCallback(order.id, 'create').catch((err) => {
        this.logger.warn(
          `Activity callback error: ${(err as Error)?.message ?? String(err)}`
        );
      });
    } else {
      // Store pending callback to be sent after data gathering completes
      this.logger.log(
        `Deferring callback for order ${order.id} until asset data gathered`
      );
      await this.storePendingCallback(order.id, 'create', {
        dataSource: order.SymbolProfile.dataSource,
        symbol: order.SymbolProfile.symbol
      });
    }

    return order;
  }

  private async sendActivityCallback(
    orderId: string,
    operation: 'create' | 'update' | 'delete'
  ): Promise<void> {
    try {
      // Fetch the full order details with relations
      const fullOrder = (await this.prismaService.order.findUnique({
        where: { id: orderId },
        include: { tags: true, SymbolProfile: true }
      })) as any;

      if (!fullOrder) {
        this.logger.warn(`Order ${orderId} not found for callback`);
        return;
      }

      // Get user settings to check for activity callback URL
      const user = await this.userService.user({ id: fullOrder.userId });
      const callbackUrl = user?.settings?.settings?.activityCallbackUrl;

      if (!callbackUrl) return;

      let url: URL;
      try {
        url = new URL(callbackUrl as string);
      } catch (err) {
        this.logger.warn(
          `Invalid activity callback URL configured: ${String(callbackUrl)}`
        );
        return;
      }

      const params = new URLSearchParams();
      params.append('id', fullOrder.id);
      if (fullOrder.userId) params.append('userId', fullOrder.userId);
      if (fullOrder.accountId) {
        // Use account name instead of account id in callback
        const account = await this.accountService.account({
          id_userId: { userId: fullOrder.userId, id: fullOrder.accountId }
        });
        if (account?.name) params.append('accountName', account.name);
      }
      if (fullOrder.type) params.append('type', String(fullOrder.type));
      if (fullOrder.date)
        params.append('date', (fullOrder.date as Date).toISOString());
      if (fullOrder.quantity !== undefined && fullOrder.quantity !== null)
        params.append('quantity', String(fullOrder.quantity));
      if (fullOrder.unitPrice !== undefined && fullOrder.unitPrice !== null)
        params.append('unitPrice', String(fullOrder.unitPrice));
      if (fullOrder.fee !== undefined && fullOrder.fee !== null)
        params.append('fee', String(fullOrder.fee));
      if (fullOrder.SymbolProfile?.symbol)
        params.append('symbol', fullOrder.SymbolProfile.symbol);
      if (fullOrder.SymbolProfile?.currency)
        params.append('currency', fullOrder.SymbolProfile.currency);
      if (fullOrder.SymbolProfile?.name)
        params.append('assetName', fullOrder.SymbolProfile.name);

      // Include comment (note) if present
      if (fullOrder.comment) params.append('note', String(fullOrder.comment));

      // Include tags (names and ids) if present
      if (fullOrder.tags && fullOrder.tags.length > 0) {
        const tagNames = fullOrder.tags.map((t) => t.name);
        // Send tags as repeated tags[] parameters so receivers can parse them as an array
        tagNames.forEach((name: string) => params.append('tags[]', name));
      }

      params.append('operation', operation);

      // Merge existing search params if any
      const existing = url.search ? url.search.substring(1) : '';
      const combined = [existing, params.toString()]
        .filter((p) => p && p.length > 0)
        .join('&');
      url.search = combined;

      // Perform GET with short timeout. Swallow errors.
      await axios.get(url.toString(), { timeout: 3000 }).catch((err) => {
        this.logger.warn(
          `Activity callback request failed: ${err?.message ?? String(err)}`
        );
      });
    } catch (err) {
      this.logger.warn(
        `Activity callback error: ${err?.message ?? String(err)}`
      );
    }
  }

  private async storePendingCallback(
    orderId: string,
    operation: 'create' | 'update' | 'delete',
    assetIdentifier: { dataSource: DataSource; symbol: string }
  ): Promise<void> {
    const key = `${assetIdentifier.dataSource}:${assetIdentifier.symbol}`;
    const callbacks = this.pendingCallbacks.get(key) || [];
    callbacks.push({ orderId, operation });
    this.pendingCallbacks.set(key, callbacks);
  }

  public async processPendingCallbacks(
    dataSource: DataSource,
    symbol: string
  ): Promise<void> {
    const key = `${dataSource}:${symbol}`;
    const callbacks = this.pendingCallbacks.get(key);

    if (!callbacks || callbacks.length === 0) {
      return;
    }

    this.logger.log(
      `Processing ${callbacks.length} pending callback(s) for ${symbol} (${dataSource})`
    );

    // Process all pending callbacks for this asset
    for (const { orderId, operation } of callbacks) {
      try {
        await this.sendActivityCallback(orderId, operation);
      } catch (err) {
        this.logger.error(
          `Failed to process pending callback for order ${orderId}: ${(err as Error)?.message ?? String(err)}`
        );
      }
    }

    // Clear processed callbacks
    this.pendingCallbacks.delete(key);
  }

  public async deleteOrder(
    where: Prisma.OrderWhereUniqueInput
  ): Promise<Order> {
    // Fetch the full order details BEFORE deleting for callback purposes
    const fullOrderForCallback = await this.prismaService.order.findUnique({
      where,
      include: { tags: true, SymbolProfile: true }
    });

    const order = await this.prismaService.order.delete({
      where
    });

    const [symbolProfile] =
      await this.symbolProfileService.getSymbolProfilesByIds([
        order.symbolProfileId
      ]);

    if (symbolProfile.activitiesCount === 0) {
      await this.symbolProfileService.deleteById(order.symbolProfileId);
    }

    // Fire-and-forget: call activity callback URL if configured. Do not block or throw.
    (async () => {
      try {
        // Get user settings to check for activity callback URL
        const user = await this.userService.user({ id: order.userId });
        const callbackUrl = user?.settings?.settings?.activityCallbackUrl;
        if (!callbackUrl) return;

        let url: URL;
        try {
          url = new URL(callbackUrl as string);
        } catch (err) {
          this.logger.warn(
            `Invalid activity callback URL configured: ${String(callbackUrl)}`
          );
          return;
        }

        // Use the pre-fetched full order details (since the order was already deleted)
        const fullOrder = (fullOrderForCallback ?? order) as any;

        const params = new URLSearchParams();
        params.append('id', fullOrder.id);
        if (fullOrder.userId) params.append('userId', fullOrder.userId);
        if (fullOrder.accountId) {
          // Use account name instead of account id in callback
          const account = await this.accountService.account({
            id_userId: { userId: fullOrder.userId, id: fullOrder.accountId }
          });
          if (account?.name) params.append('accountName', account.name);
        }
        if (fullOrder.type) params.append('type', String(fullOrder.type));
        if (fullOrder.date)
          params.append('date', (fullOrder.date as Date).toISOString());
        if (fullOrder.quantity !== undefined && fullOrder.quantity !== null)
          params.append('quantity', String(fullOrder.quantity));
        if (fullOrder.unitPrice !== undefined && fullOrder.unitPrice !== null)
          params.append('unitPrice', String(fullOrder.unitPrice));
        if (fullOrder.fee !== undefined && fullOrder.fee !== null)
          params.append('fee', String(fullOrder.fee));
        if (fullOrder.SymbolProfile?.symbol)
          params.append('symbol', fullOrder.SymbolProfile.symbol);
        if (fullOrder.SymbolProfile?.currency)
          params.append('currency', fullOrder.SymbolProfile.currency);
        if (fullOrder.SymbolProfile?.name)
          params.append('assetName', fullOrder.SymbolProfile.name);

        params.append('operation', 'delete');

        // Include comment (note) if present
        if (fullOrder.comment) params.append('note', String(fullOrder.comment));

        // Include tags (names and ids) if present
        if (fullOrder.tags && fullOrder.tags.length > 0) {
          const tagNames = fullOrder.tags.map((t) => t.name);
          // Send tags as repeated tags[] parameters so receivers can parse them as an array
          tagNames.forEach((name: string) => params.append('tags[]', name));
          // Also send tag ids for convenience
          const tagIds = fullOrder.tags.map((t) => t.id);
          tagIds.forEach((id: string) => params.append('tagIds[]', id));
        }

        // Merge existing search params if any
        const existing = url.search ? url.search.substring(1) : '';
        const combined = [existing, params.toString()]
          .filter((p) => p && p.length > 0)
          .join('&');
        url.search = combined;

        // Perform GET with short timeout. Swallow errors.
        axios.get(url.toString(), { timeout: 3000 }).catch((err) => {
          this.logger.warn(
            `Activity callback request failed: ${err?.message ?? String(err)}`
          );
        });
      } catch (err) {
        this.logger.warn(
          `Activity callback error: ${err?.message ?? String(err)}`
        );
      }
    })();

    this.eventEmitter.emit(
      PortfolioChangedEvent.getName(),
      new PortfolioChangedEvent({
        userId: order.userId
      })
    );

    return order;
  }

  public async deleteOrders({
    filters,
    userId
  }: {
    filters?: Filter[];
    userId: string;
  }): Promise<number> {
    const { activities } = await this.getOrders({
      filters,
      userId,
      includeDrafts: true,
      userCurrency: undefined,
      withExcludedAccountsAndActivities: true
    });

    const { count } = await this.prismaService.order.deleteMany({
      where: {
        id: {
          in: activities.map(({ id }) => {
            return id;
          })
        }
      }
    });

    const symbolProfiles =
      await this.symbolProfileService.getSymbolProfilesByIds(
        activities.map(({ symbolProfileId }) => {
          return symbolProfileId;
        })
      );

    for (const { activitiesCount, id } of symbolProfiles) {
      if (activitiesCount === 0) {
        await this.symbolProfileService.deleteById(id);
      }
    }

    this.eventEmitter.emit(
      PortfolioChangedEvent.getName(),
      new PortfolioChangedEvent({ userId })
    );

    return count;
  }

  /**
   * Generates synthetic orders for cash holdings based on account balance history.
   * Treat currencies as assets with a fixed unit price of 1.0 (in their own currency) to allow
   * performance tracking based on exchange rate fluctuations.
   *
   * @param cashDetails - The cash balance details.
   * @param filters - Optional filters to apply.
   * @param userCurrency - The base currency of the user.
   * @param userId - The ID of the user.
   * @returns A response containing the list of synthetic cash activities.
   */
  public async getCashOrders({
    cashDetails,
    filters = [],
    userCurrency,
    userId
  }: {
    cashDetails: CashDetails;
    filters?: Filter[];
    userCurrency: string;
    userId: string;
  }): Promise<ActivitiesResponse> {
    const filtersByAssetClass = filters.filter(({ type }) => {
      return type === 'ASSET_CLASS';
    });

    if (
      filtersByAssetClass.length > 0 &&
      !filtersByAssetClass.find(({ id }) => {
        return id === AssetClass.LIQUIDITY;
      })
    ) {
      // If asset class filters are present and none of them is liquidity, return an empty response
      return {
        activities: [],
        count: 0
      };
    }

    const activities: Activity[] = [];

    for (const account of cashDetails.accounts) {
      const { balances } = await this.accountBalanceService.getAccountBalances({
        userCurrency,
        userId,
        filters: [{ id: account.id, type: 'ACCOUNT' }]
      });

      let currentBalance = 0;
      let currentBalanceInBaseCurrency = 0;

      for (const balanceItem of balances) {
        const syntheticActivityTemplate: Activity = {
          userId,
          accountId: account.id,
          accountUserId: account.userId,
          comment: account.name,
          createdAt: new Date(balanceItem.date),
          currency: account.currency,
          date: new Date(balanceItem.date),
          fee: 0,
          feeInAssetProfileCurrency: 0,
          feeInBaseCurrency: 0,
          id: balanceItem.id,
          isDraft: false,
          quantity: 1,
          SymbolProfile: {
            activitiesCount: 0,
            assetClass: AssetClass.LIQUIDITY,
            assetSubClass: AssetSubClass.CASH,
            countries: [],
            createdAt: new Date(balanceItem.date),
            currency: account.currency,
            dataSource:
              this.dataProviderService.getDataSourceForExchangeRates(),
            holdings: [],
            id: account.currency,
            isActive: true,
            name: account.currency,
            sectors: [],
            symbol: account.currency,
            updatedAt: new Date(balanceItem.date)
          },
          symbolProfileId: account.currency,
          type: ActivityType.BUY,
          unitPrice: 1,
          unitPriceInAssetProfileCurrency: 1,
          updatedAt: new Date(balanceItem.date),
          valueInBaseCurrency: 0,
          value: 0
        };

        if (currentBalance < balanceItem.value) {
          // BUY
          activities.push({
            ...syntheticActivityTemplate,
            quantity: balanceItem.value - currentBalance,
            type: ActivityType.BUY,
            value: balanceItem.value - currentBalance,
            valueInBaseCurrency:
              balanceItem.valueInBaseCurrency - currentBalanceInBaseCurrency
          });
        } else if (currentBalance > balanceItem.value) {
          // SELL
          activities.push({
            ...syntheticActivityTemplate,
            quantity: currentBalance - balanceItem.value,
            type: ActivityType.SELL,
            value: currentBalance - balanceItem.value,
            valueInBaseCurrency:
              currentBalanceInBaseCurrency - balanceItem.valueInBaseCurrency
          });
        }

        currentBalance = balanceItem.value;
        currentBalanceInBaseCurrency = balanceItem.valueInBaseCurrency;
      }
    }

    return {
      activities,
      count: activities.length
    };
  }

  public async getLatestOrder({ dataSource, symbol }: AssetProfileIdentifier) {
    return this.prismaService.order.findFirst({
      orderBy: {
        date: 'desc'
      },
      where: {
        SymbolProfile: { dataSource, symbol }
      }
    });
  }

  public async getOrders({
    endDate,
    filters,
    includeDrafts = false,
    skip,
    sortColumn,
    sortDirection = 'asc',
    startDate,
    take = Number.MAX_SAFE_INTEGER,
    types,
    userCurrency,
    userId,
    withExcludedAccountsAndActivities = false
  }: {
    endDate?: Date;
    filters?: Filter[];
    includeDrafts?: boolean;
    skip?: number;
    sortColumn?: string;
    sortDirection?: Prisma.SortOrder;
    startDate?: Date;
    take?: number;
    types?: ActivityType[];
    userCurrency: string;
    userId: string;
    withExcludedAccountsAndActivities?: boolean;
  }): Promise<ActivitiesResponse> {
    let orderBy: Prisma.Enumerable<Prisma.OrderOrderByWithRelationInput> = [
      { date: 'asc' }
    ];

    const where: Prisma.OrderWhereInput = { userId };

    if (endDate || startDate) {
      where.AND = [];

      if (endDate) {
        where.AND.push({ date: { lte: endDate } });
      }

      if (startDate) {
        where.AND.push({ date: { gt: startDate } });
      }
    }

    const {
      ACCOUNT: filtersByAccount,
      ASSET_CLASS: filtersByAssetClass,
      DATA_SOURCE: filtersByDataSource,
      SYMBOL: filtersBySymbol,
      TAG: filtersByTag
    } = groupBy(filters, ({ type }) => {
      return type;
    });

    const searchQuery = filters?.find(({ type }) => {
      return type === 'SEARCH_QUERY';
    })?.id;

    if (filtersByAccount?.length > 0) {
      where.accountId = {
        in: filtersByAccount.map(({ id }) => {
          return id;
        })
      };
    }

    if (includeDrafts === false) {
      where.isDraft = false;
    }

    if (filtersByAssetClass?.length > 0) {
      where.SymbolProfile = {
        OR: [
          {
            AND: [
              {
                OR: filtersByAssetClass.map(({ id }) => {
                  return { assetClass: AssetClass[id] };
                })
              },
              {
                OR: [
                  { SymbolProfileOverrides: { is: null } },
                  { SymbolProfileOverrides: { assetClass: null } }
                ]
              }
            ]
          },
          {
            SymbolProfileOverrides: {
              OR: filtersByAssetClass.map(({ id }) => {
                return { assetClass: AssetClass[id] };
              })
            }
          }
        ]
      };
    }

    // Handle symbol and dataSource filtering
    if (filtersBySymbol?.length > 0) {
      if (filtersByDataSource?.length > 0) {
        // Both dataSource and symbol specified: create OR conditions for each pair
        const symbolProfileConditions: Prisma.SymbolProfileWhereInput[] = [];

        for (const dataSourceFilter of filtersByDataSource) {
          for (const symbolFilter of filtersBySymbol) {
            symbolProfileConditions.push({
              AND: [
                { dataSource: dataSourceFilter.id as DataSource },
                { symbol: symbolFilter.id }
              ]
            });
          }
        }

        const symbolProfileFilter: Prisma.SymbolProfileWhereInput =
          symbolProfileConditions.length === 1
            ? symbolProfileConditions[0]
            : { OR: symbolProfileConditions };

        if (where.SymbolProfile) {
          where.SymbolProfile = {
            AND: [where.SymbolProfile, symbolProfileFilter]
          };
        } else {
          where.SymbolProfile = symbolProfileFilter;
        }
      } else {
        // Only symbol specified: filter by symbol regardless of dataSource
        const symbolFilter: Prisma.SymbolProfileWhereInput =
          filtersBySymbol.length === 1
            ? { symbol: filtersBySymbol[0].id }
            : { OR: filtersBySymbol.map(({ id }) => ({ symbol: id })) };

        if (where.SymbolProfile) {
          where.SymbolProfile = {
            AND: [where.SymbolProfile, symbolFilter]
          };
        } else {
          where.SymbolProfile = symbolFilter;
        }
      }
    }

    if (searchQuery) {
      const searchQueryWhereInput: Prisma.SymbolProfileWhereInput[] = [
        { id: { mode: 'insensitive', startsWith: searchQuery } },
        { isin: { mode: 'insensitive', startsWith: searchQuery } },
        { name: { mode: 'insensitive', startsWith: searchQuery } },
        { symbol: { mode: 'insensitive', startsWith: searchQuery } }
      ];

      if (where.SymbolProfile) {
        where.SymbolProfile = {
          AND: [
            where.SymbolProfile,
            {
              OR: searchQueryWhereInput
            }
          ]
        };
      } else {
        where.SymbolProfile = {
          OR: searchQueryWhereInput
        };
      }
    }

    if (filtersByTag?.length > 0) {
      where.tags = {
        some: {
          OR: filtersByTag.map(({ id }) => {
            return { id };
          })
        }
      };
    }

    if (sortColumn) {
      orderBy = [{ [sortColumn]: sortDirection }];
    }

    if (types) {
      where.type = { in: types };
    }

    if (withExcludedAccountsAndActivities === false) {
      where.OR = [
        { account: null },
        { account: { NOT: { isExcluded: true } } }
      ];

      where.tags = {
        ...where.tags,
        none: {
          id: TAG_ID_EXCLUDE_FROM_ANALYSIS
        }
      };
    }

    const [orders, count] = await Promise.all([
      this.orders({
        skip,
        take,
        where,
        include: {
          account: {
            include: {
              platform: true
            }
          },
          // eslint-disable-next-line @typescript-eslint/naming-convention
          SymbolProfile: true,
          tags: true
        },
        orderBy: [...orderBy, { id: sortDirection }]
      }),
      this.prismaService.order.count({ where })
    ]);

    const assetProfileIdentifiers = uniqBy(
      orders.map(({ SymbolProfile }) => {
        return {
          dataSource: SymbolProfile.dataSource,
          symbol: SymbolProfile.symbol
        };
      }),
      ({ dataSource, symbol }) => {
        return getAssetProfileIdentifier({
          dataSource,
          symbol
        });
      }
    );

    const assetProfiles = await this.symbolProfileService.getSymbolProfiles(
      assetProfileIdentifiers
    );

    const activities = await Promise.all(
      orders.map(async (order) => {
        const assetProfile = assetProfiles.find(({ dataSource, symbol }) => {
          return (
            dataSource === order.SymbolProfile.dataSource &&
            symbol === order.SymbolProfile.symbol
          );
        });

        const value = new Big(order.quantity).mul(order.unitPrice).toNumber();

        const [
          feeInAssetProfileCurrency,
          feeInBaseCurrency,
          unitPriceInAssetProfileCurrency,
          valueInBaseCurrency
        ] = await Promise.all([
          this.exchangeRateDataService.toCurrencyAtDate(
            order.fee,
            order.currency ?? order.SymbolProfile.currency,
            order.SymbolProfile.currency,
            order.date
          ),
          this.exchangeRateDataService.toCurrencyAtDate(
            order.fee,
            order.currency ?? order.SymbolProfile.currency,
            userCurrency,
            order.date
          ),
          this.exchangeRateDataService.toCurrencyAtDate(
            order.unitPrice,
            order.currency ?? order.SymbolProfile.currency,
            order.SymbolProfile.currency,
            order.date
          ),
          this.exchangeRateDataService.toCurrencyAtDate(
            value,
            order.currency ?? order.SymbolProfile.currency,
            userCurrency,
            order.date
          )
        ]);

        return {
          ...order,
          feeInAssetProfileCurrency,
          feeInBaseCurrency,
          unitPriceInAssetProfileCurrency,
          value,
          valueInBaseCurrency,
          SymbolProfile: assetProfile
        };
      })
    );

    return { activities, count };
  }

  /**
   * Retrieves all orders required for the portfolio calculator, including both standard asset orders
   * and optional synthetic orders representing cash activities.
   */
  @LogPerformance
  public async getOrdersForPortfolioCalculator({
    filters,
    userCurrency,
    userId,
    withCash = false
  }: {
    /** Optional filters to apply to the orders. */
    filters?: Filter[];
    /** The base currency of the user. */
    userCurrency: string;
    /** The ID of the user. */
    userId: string;
    /** Whether to include cash activities in the result. */
    withCash?: boolean;
  }) {
    const orders = await this.getOrders({
      filters,
      userCurrency,
      userId,
      withExcludedAccountsAndActivities: false // TODO
    });

    if (withCash) {
      const cashDetails = await this.accountService.getCashDetails({
        filters,
        userId,
        currency: userCurrency
      });

      const cashOrders = await this.getCashOrders({
        cashDetails,
        filters,
        userCurrency,
        userId
      });

      orders.activities.push(...cashOrders.activities);
      orders.count += cashOrders.count;
    }

    return orders;
  }

  public async getStatisticsByCurrency(
    currency: EnhancedSymbolProfile['currency']
  ): Promise<{
    activitiesCount: EnhancedSymbolProfile['activitiesCount'];
    dateOfFirstActivity: EnhancedSymbolProfile['dateOfFirstActivity'];
  }> {
    const { _count, _min } = await this.prismaService.order.aggregate({
      _count: true,
      _min: {
        date: true
      },
      where: { SymbolProfile: { currency } }
    });

    return {
      activitiesCount: _count as number,
      dateOfFirstActivity: _min.date
    };
  }

  public async order(
    orderWhereUniqueInput: Prisma.OrderWhereUniqueInput
  ): Promise<Order | null> {
    return this.prismaService.order.findUnique({
      where: orderWhereUniqueInput
    });
  }

  public async updateOrder({
    data,
    where
  }: {
    data: Prisma.OrderUpdateInput & {
      assetClass?: AssetClass;
      assetSubClass?: AssetSubClass;
      currency?: string;
      symbol?: string;
      tags?: { id: string }[];
      type?: ActivityType;
    };
    where: Prisma.OrderWhereUniqueInput;
  }): Promise<Order> {
    // Fetch the full order details BEFORE updating for callback purposes
    const fullOrderBeforeUpdate = await this.prismaService.order.findUnique({
      where,
      include: { tags: true, SymbolProfile: true }
    });

    if (!data.comment) {
      data.comment = null;
    }

    const tags = data.tags ?? [];

    let isDraft = false;

    if (
      ['FEE', 'INTEREST', 'LIABILITY'].includes(data.type) ||
      (data.SymbolProfile.connect.dataSource_symbol.dataSource === 'MANUAL' &&
        data.type === 'BUY')
    ) {
      if (data.account?.connect?.id_userId?.id === null) {
        data.account = { disconnect: true };
      }

      delete data.SymbolProfile.connect;
      delete data.SymbolProfile.update.name;
    } else {
      delete data.SymbolProfile.update;

      isDraft = isAfter(data.date as Date, endOfToday());

      if (!isDraft) {
        // Gather symbol data of order in the background, if not draft
        this.dataGatheringService.gatherSymbols({
          dataGatheringItems: [
            {
              dataSource:
                data.SymbolProfile.connect.dataSource_symbol.dataSource,
              date: data.date as Date,
              symbol: data.SymbolProfile.connect.dataSource_symbol.symbol
            }
          ],
          priority: DATA_GATHERING_QUEUE_PRIORITY_HIGH
        });
      }
    }

    delete data.assetClass;
    delete data.assetSubClass;
    delete data.symbol;
    delete data.tags;

    // Fire-and-forget: call activity callback URL for DELETION with old data before update. Do not block or throw.
    (async () => {
      if (!fullOrderBeforeUpdate) return;

      try {
        // Get user settings to check for activity callback URL
        const user = await this.userService.user({
          id: fullOrderBeforeUpdate.userId
        });
        const callbackUrl = user?.settings?.settings?.activityCallbackUrl;
        if (!callbackUrl) return;

        let url: URL;
        try {
          url = new URL(callbackUrl as string);
        } catch (err) {
          this.logger.warn(
            `Invalid activity callback URL configured: ${String(callbackUrl)}`
          );
          return;
        }

        // Use the pre-update order data for the deletion callback
        const fullOrder = fullOrderBeforeUpdate as any;

        const params = new URLSearchParams();
        params.append('id', fullOrder.id);
        if (fullOrder.userId) params.append('userId', fullOrder.userId);
        if (fullOrder.accountId) {
          // Use account name instead of account id in callback
          const account = await this.accountService.account({
            id_userId: { userId: fullOrder.userId, id: fullOrder.accountId }
          });
          if (account?.name) params.append('accountName', account.name);
        }
        if (fullOrder.type) params.append('type', String(fullOrder.type));
        if (fullOrder.date)
          params.append('date', (fullOrder.date as Date).toISOString());
        if (fullOrder.quantity !== undefined && fullOrder.quantity !== null)
          params.append('quantity', String(fullOrder.quantity));
        if (fullOrder.unitPrice !== undefined && fullOrder.unitPrice !== null)
          params.append('unitPrice', String(fullOrder.unitPrice));
        if (fullOrder.fee !== undefined && fullOrder.fee !== null)
          params.append('fee', String(fullOrder.fee));
        if (fullOrder.SymbolProfile?.symbol)
          params.append('symbol', fullOrder.SymbolProfile.symbol);
        if (fullOrder.SymbolProfile?.currency)
          params.append('currency', fullOrder.SymbolProfile.currency);
        if (fullOrder.SymbolProfile?.name)
          params.append('assetName', fullOrder.SymbolProfile.name);

        // Include comment (note) if present
        if (fullOrder.comment) params.append('note', String(fullOrder.comment));

        // Include tags (names and ids) if present
        if (fullOrder.tags && fullOrder.tags.length > 0) {
          const tagNames = fullOrder.tags.map((t) => t.name);
          // Send tags as repeated tags[] parameters so receivers can parse them as an array
          tagNames.forEach((name: string) => params.append('tags[]', name));
          // Also send tag ids for convenience
          const tagIds = fullOrder.tags.map((t) => t.id);
          tagIds.forEach((id: string) => params.append('tagIds[]', id));
        }

        params.append('operation', 'delete');

        // Merge existing search params if any
        const existing = url.search ? url.search.substring(1) : '';
        const combined = [existing, params.toString()]
          .filter((p) => p && p.length > 0)
          .join('&');
        url.search = combined;

        // Perform GET with short timeout. Swallow errors.
        axios.get(url.toString(), { timeout: 3000 }).catch((err) => {
          this.logger.warn(
            `Activity callback request failed: ${err?.message ?? String(err)}`
          );
        });
      } catch (err) {
        this.logger.warn(
          `Activity callback error: ${err?.message ?? String(err)}`
        );
      }
    })();

    // Remove existing tags
    await this.prismaService.order.update({
      where,
      data: { tags: { set: [] } }
    });

    const order = await this.prismaService.order.update({
      where,
      data: {
        ...data,
        isDraft,
        tags: {
          connect: tags
        }
      }
    });

    // Fire-and-forget: call activity callback URL for CREATION with new data after update. Do not block or throw.
    (async () => {
      try {
        // Get user settings to check for activity callback URL
        const user = await this.userService.user({ id: order.userId });
        const callbackUrl = user?.settings?.settings?.activityCallbackUrl;
        if (!callbackUrl) return;

        let url: URL;
        try {
          url = new URL(callbackUrl as string);
        } catch (err) {
          this.logger.warn(
            `Invalid activity callback URL configured: ${String(callbackUrl)}`
          );
          return;
        }

        // Ensure we have comment and tags by fetching the full order relations
        const fullOrder = ((await this.prismaService.order.findUnique({
          where: { id: order.id },
          include: { tags: true, SymbolProfile: true }
        })) ?? order) as any;

        const params = new URLSearchParams();
        params.append('id', fullOrder.id);
        if (fullOrder.userId) params.append('userId', fullOrder.userId);
        if (fullOrder.accountId) {
          // Use account name instead of account id in callback
          const account = await this.accountService.account({
            id_userId: { userId: fullOrder.userId, id: fullOrder.accountId }
          });
          if (account?.name) params.append('accountName', account.name);
        }
        if (fullOrder.type) params.append('type', String(fullOrder.type));
        if (fullOrder.date)
          params.append('date', (fullOrder.date as Date).toISOString());
        if (fullOrder.quantity !== undefined && fullOrder.quantity !== null)
          params.append('quantity', String(fullOrder.quantity));
        if (fullOrder.unitPrice !== undefined && fullOrder.unitPrice !== null)
          params.append('unitPrice', String(fullOrder.unitPrice));
        if (fullOrder.fee !== undefined && fullOrder.fee !== null)
          params.append('fee', String(fullOrder.fee));
        if (fullOrder.SymbolProfile?.symbol)
          params.append('symbol', fullOrder.SymbolProfile.symbol);
        if (fullOrder.SymbolProfile?.currency)
          params.append('currency', fullOrder.SymbolProfile.currency);
        if (fullOrder.SymbolProfile?.name)
          params.append('assetName', fullOrder.SymbolProfile.name);

        // Include comment (note) if present
        if (fullOrder.comment) params.append('note', String(fullOrder.comment));

        // Include tags (names and ids) if present
        if (fullOrder.tags && fullOrder.tags.length > 0) {
          const tagNames = fullOrder.tags.map((t) => t.name);
          // Send tags as repeated tags[] parameters so receivers can parse them as an array
          tagNames.forEach((name: string) => params.append('tags[]', name));
        }

        params.append('operation', 'create');

        // Merge existing search params if any
        const existing = url.search ? url.search.substring(1) : '';
        const combined = [existing, params.toString()]
          .filter((p) => p && p.length > 0)
          .join('&');
        url.search = combined;

        // Perform GET with short timeout. Swallow errors.
        axios.get(url.toString(), { timeout: 3000 }).catch((err) => {
          this.logger.warn(
            `Activity callback request failed: ${err?.message ?? String(err)}`
          );
        });
      } catch (err) {
        this.logger.warn(
          `Activity callback error: ${err?.message ?? String(err)}`
        );
      }
    })();

    this.eventEmitter.emit(
      PortfolioChangedEvent.getName(),
      new PortfolioChangedEvent({
        userId: order.userId
      })
    );

    return order;
  }

  private async orders(params: {
    include?: Prisma.OrderInclude;
    skip?: number;
    take?: number;
    cursor?: Prisma.OrderWhereUniqueInput;
    where?: Prisma.OrderWhereInput;
    orderBy?: Prisma.Enumerable<Prisma.OrderOrderByWithRelationInput>;
  }): Promise<OrderWithAccount[]> {
    const { include, skip, take, cursor, where, orderBy } = params;

    return this.prismaService.order.findMany({
      cursor,
      include,
      orderBy,
      skip,
      take,
      where
    });
  }
}

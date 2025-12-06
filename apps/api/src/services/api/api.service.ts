import { Filter } from '@ghostfolio/common/interfaces';

import { Injectable } from '@nestjs/common';

@Injectable()
export class ApiService {
  public buildFiltersFromQueryParams({
    filterByAccounts,
    filterByAssetClasses,
    filterByAssetSubClasses,
    filterByDataSource,
    filterByHoldingType,
    filterBySearchQuery,
    filterBySymbol,
    filterByTags
  }: {
    filterByAccounts?: string;
    filterByAssetClasses?: string;
    filterByAssetSubClasses?: string;
    filterByDataSource?: string;
    filterByHoldingType?: string;
    filterBySearchQuery?: string;
    filterBySymbol?: string;
    filterByTags?: string;
  }): Filter[] {
    const accountIds = filterByAccounts?.split(',') ?? [];
    const assetClasses = filterByAssetClasses?.split(',') ?? [];
    const assetSubClasses = filterByAssetSubClasses?.split(',') ?? [];
    const dataSources = filterByDataSource?.split(',') ?? [];
    const holdingType = filterByHoldingType;
    const searchQuery = filterBySearchQuery?.toLowerCase();
    const symbols = filterBySymbol?.split(',') ?? [];
    const tagIds = filterByTags?.split(',') ?? [];

    const filters = [
      ...accountIds.map((accountId) => {
        return {
          id: accountId,
          type: 'ACCOUNT'
        } as Filter;
      }),
      ...assetClasses.map((assetClass) => {
        return {
          id: assetClass,
          type: 'ASSET_CLASS'
        } as Filter;
      }),
      ...assetSubClasses.map((assetClass) => {
        return {
          id: assetClass,
          type: 'ASSET_SUB_CLASS'
        } as Filter;
      }),
      ...tagIds.map((tagId) => {
        return {
          id: tagId,
          type: 'TAG'
        } as Filter;
      }),
      ...dataSources.map((dataSource) => {
        return {
          id: dataSource,
          type: 'DATA_SOURCE'
        } as Filter;
      }),
      ...symbols.map((symbol) => {
        return {
          id: symbol,
          type: 'SYMBOL'
        } as Filter;
      })
    ];

    if (holdingType) {
      filters.push({
        id: holdingType,
        type: 'HOLDING_TYPE'
      });
    }

    if (searchQuery) {
      filters.push({
        id: searchQuery,
        type: 'SEARCH_QUERY'
      });
    }

    return filters;
  }
}

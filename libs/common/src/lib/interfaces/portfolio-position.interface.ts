import { Market, MarketAdvanced } from '@ghostfolio/common/types';

import { AssetSubClass, DataSource, Tag } from '@prisma/client';

import { Country } from './country.interface';
import { EnhancedSymbolProfile } from './enhanced-symbol-profile.interface';

export interface PortfolioPosition {
  activitiesCount: number;
  allocationInPercentage: number;
  assetProfile: Pick<
    EnhancedSymbolProfile,
    | 'assetClass'
    | 'assetSubClass'
    | 'countries'
    | 'currency'
    | 'dataSource'
    | 'holdings'
    | 'name'
    | 'sectors'
    | 'symbol'
    | 'url'
  > & {
    assetClassLabel?: string;
    assetSubClassLabel?: string;
  };

  /** @deprecated */
  assetSubClass?: AssetSubClass;

  /** @deprecated */
  assetSubClassLabel?: string;
  averagePrice?: number;

  /** @deprecated */
  countries: Country[];

  /** @deprecated */
  currency: string;

  /** @deprecated */
  dataSource: DataSource;

  dateOfFirstActivity: Date;
  dividend: number;
  exchange?: string;
  grossPerformance: number;
  grossPerformancePercent: number;
  grossPerformancePercentWithCurrencyEffect: number;
  grossPerformanceWithCurrencyEffect: number;
  investment: number;
  marketChange?: number;
  marketChangePercent?: number;
  marketPrice: number;
  markets?: { [key in Market]: number };
  marketsAdvanced?: { [key in MarketAdvanced]: number };
  netPerformance: number;
  netPerformancePercent: number;
  netPerformancePercentWithCurrencyEffect: number;
  netPerformanceWithCurrencyEffect: number;
  quantity: number;
  tags?: Tag[];
  type?: string;
  valueInBaseCurrency?: number;
  valueInPercentage?: number;
}

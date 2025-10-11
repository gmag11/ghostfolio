import {
  EnhancedSymbolProfile,
  PortfolioDetails,
  PortfolioPosition
} from '@ghostfolio/common/interfaces';
import { Market } from '@ghostfolio/common/types';

import { Order } from '@prisma/client';

export interface PublicPortfolioResponse extends PublicPortfolioResponseV1 {
  alias?: string;
  hasDetails: boolean;
  holdings: {
    [symbol: string]: Pick<
      PortfolioPosition,
      | 'allocationInPercentage'
      | 'assetClass'
      | 'averagePrice'
      | 'countries'
      | 'currency'
      | 'dataSource'
      | 'dateOfFirstActivity'
      | 'grossPerformance'
      | 'investment'
      | 'markets'
      | 'name'
      | 'netPerformance'
      | 'netPerformancePercentWithCurrencyEffect'
      | 'netPerformanceWithCurrencyEffect'
      | 'quantity'
      | 'sectors'
      | 'symbol'
      | 'url'
      | 'valueInBaseCurrency'
      | 'valueInPercentage'
    >;
  };
  latestActivities: (Pick<
    Order,
    'currency' | 'date' | 'fee' | 'quantity' | 'type' | 'unitPrice'
  > & {
    SymbolProfile?: EnhancedSymbolProfile;
    value: number;
    valueInBaseCurrency: number;
  })[];
  markets: {
    [key in Market]: Pick<
      PortfolioDetails['markets'][key],
      'id' | 'valueInPercentage'
    >;
  };
  summary?: {
    totalInvestment: number;
    currentValue: number;
    netPerformance: number;
  };
}

interface PublicPortfolioResponseV1 {
  createdAt: Date;
  performance: {
    '1d': {
      relativeChange: number;
    };
    max: {
      relativeChange: number;
    };
    ytd: {
      relativeChange: number;
    };
  };
}

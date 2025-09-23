import { AccessType } from '@ghostfolio/common/types';

import { AccessPermission } from '@prisma/client';

export interface Access {
  accountIds?: string[];
  alias?: string;
  grantee?: string;
  id: string;
  permissions: AccessPermission[];
  type: AccessType;
}

import { Access } from '@ghostfolio/common/interfaces';

export interface CreateOrUpdateAccessDialogParams {
  access: Access & { accountIds?: string[] };
  accessId?: string;
}

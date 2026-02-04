import { redactPaths } from '@ghostfolio/api/helper/object.helper';
import {
  DEFAULT_REDACTED_PATHS,
  HEADER_KEY_IMPERSONATION
} from '@ghostfolio/common/config';
import {
  hasReadRestrictedOnlyAccessPermission,
  isRestrictedView
} from '@ghostfolio/common/permissions';
import { UserWithSettings } from '@ghostfolio/common/types';

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class RedactValuesInResponseInterceptor<T> implements NestInterceptor<
  T,
  T
> {
  public intercept(
    context: ExecutionContext,
    next: CallHandler<T>
  ): Observable<T> {
    return next.handle().pipe(
      map((data: T) => {
        const { headers, user }: { headers: Headers; user: UserWithSettings } =
          context.switchToHttp().getRequest();

        const impersonationId: string | undefined = headers?.[
          HEADER_KEY_IMPERSONATION.toLowerCase()
        ] as string | undefined;

        const shouldRedact: boolean =
          hasReadRestrictedOnlyAccessPermission({
            impersonationId,
            user
          }) || isRestrictedView(user);

        if (shouldRedact) {
          return redactPaths({
            object: data,
            paths: DEFAULT_REDACTED_PATHS
          }) as T;
        }

        return data;
      })
    );
  }
}

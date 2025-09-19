import { GfUserAccountCallbacksComponent } from '@ghostfolio/client/components/user-account-callbacks/user-account-callbacks.component';

import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GfUserAccountCallbacksComponent],
  selector: 'gf-user-account-callbacks-page',
  styleUrls: ['./user-account-callbacks-page.component.scss'],
  templateUrl: './user-account-callbacks-page.component.html'
})
export class GfUserAccountCallbacksPageComponent {}

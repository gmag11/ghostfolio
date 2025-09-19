import { NotificationService } from '@ghostfolio/client/core/notification/notification.service';
import { DataService } from '@ghostfolio/client/services/data.service';
import { UserService } from '@ghostfolio/client/services/user/user.service';
import { User } from '@ghostfolio/common/interfaces';

import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Subject, takeUntil } from 'rxjs';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule
  ],
  selector: 'gf-user-account-callbacks',
  styleUrls: ['./user-account-callbacks.component.scss'],
  templateUrl: './user-account-callbacks.component.html'
})
export class GfUserAccountCallbacksComponent implements OnInit, OnDestroy {
  public activityCallbackUrl: string | undefined;
  public user: User;

  private unsubscribeSubject = new Subject<void>();

  public constructor(
    private changeDetectorRef: ChangeDetectorRef,
    private dataService: DataService,
    private notificationService: NotificationService,
    private userService: UserService
  ) {}

  public ngOnInit() {
    this.initialize();
  }

  public ngOnDestroy() {
    this.unsubscribeSubject.next();
    this.unsubscribeSubject.complete();
  }

  public onSetActivityCallbackUrl() {
    const value = (this.activityCallbackUrl || '').trim();

    if (!value) {
      this.notificationService.alert({
        title: 'Validation',
        message: 'Please enter a URL'
      });
      return;
    }

    // basic validation using the URL constructor
    try {
      // eslint-disable-next-line no-new
      new URL(value);
    } catch (e) {
      this.notificationService.alert({
        title: 'Validation',
        message: 'Invalid URL format'
      });
      return;
    }

    this.dataService
      .putUserSetting({ activityCallbackUrl: value })
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe(() => {
        // ensure UI reflects saved value
        this.activityCallbackUrl = value;
        this.changeDetectorRef.markForCheck();
        this.notificationService.alert({
          title: 'Saved',
          message: 'Activity callback saved'
        });

        // Update user data
        this.userService
          .get(true)
          .pipe(takeUntil(this.unsubscribeSubject))
          .subscribe((user) => {
            this.user = user;
            this.changeDetectorRef.markForCheck();
          });
      });
  }

  public onClearActivityCallbackUrl() {
    // update UI immediately
    this.activityCallbackUrl = undefined;
    this.changeDetectorRef.markForCheck();

    this.dataService
      .putUserSetting({ activityCallbackUrl: undefined })
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe(() => {
        this.notificationService.alert({
          title: 'Cleared',
          message: 'Activity callback cleared'
        });

        // Update user data
        this.userService
          .get(true)
          .pipe(takeUntil(this.unsubscribeSubject))
          .subscribe((user) => {
            this.user = user;
            this.changeDetectorRef.markForCheck();
          });
      });
  }

  private initialize() {
    this.userService.stateChanged
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe((state) => {
        if (state?.user) {
          this.user = state.user;
          this.activityCallbackUrl = this.user.settings.activityCallbackUrl;
          this.changeDetectorRef.markForCheck();
        }
      });
  }
}

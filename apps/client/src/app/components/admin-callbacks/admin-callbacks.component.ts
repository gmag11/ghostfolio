import { NotificationService } from '@ghostfolio/client/core/notification/notification.service';
import { AdminService } from '@ghostfolio/client/services/admin.service';
import { DataService } from '@ghostfolio/client/services/data.service';
import { PROPERTY_ACTIVITY_CALLBACK_URL } from '@ghostfolio/common/config';

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
import { MatTableModule } from '@angular/material/table';
import { Subject, takeUntil } from 'rxjs';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatTableModule,
    MatButtonModule
  ],
  selector: 'gf-admin-callbacks',
  styleUrls: ['./admin-callbacks.component.scss'],
  templateUrl: './admin-callbacks.component.html'
})
export class GfAdminCallbacksComponent implements OnInit, OnDestroy {
  public activityCallbackUrl: string | undefined;

  private unsubscribeSubject = new Subject<void>();

  public constructor(
    private adminService: AdminService,
    private changeDetectorRef: ChangeDetectorRef,
    private dataService: DataService,
    private notificationService: NotificationService
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
      .putAdminSetting(PROPERTY_ACTIVITY_CALLBACK_URL, { value })
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe(() => {
        // ensure UI reflects saved value
        this.activityCallbackUrl = value;
        this.changeDetectorRef.markForCheck();
        this.notificationService.alert({
          title: 'Saved',
          message: 'Activity callback saved'
        });
      });
  }

  public onClearActivityCallbackUrl() {
    // update UI immediately
    this.activityCallbackUrl = undefined;
    this.changeDetectorRef.markForCheck();

    this.dataService
      .putAdminSetting(PROPERTY_ACTIVITY_CALLBACK_URL, { value: undefined })
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe(() => {
        this.notificationService.alert({
          title: 'Cleared',
          message: 'Activity callback cleared'
        });
      });
  }

  private initialize() {
    this.adminService
      .fetchAdminData()
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe(({ settings }) => {
        this.activityCallbackUrl =
          (settings[PROPERTY_ACTIVITY_CALLBACK_URL] as string) ?? undefined;

        this.changeDetectorRef.markForCheck();
      });
  }
}

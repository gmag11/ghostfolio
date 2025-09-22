import { CreateAccessDto } from '@ghostfolio/api/app/access/create-access.dto';
import { NotificationService } from '@ghostfolio/client/core/notification/notification.service';
import { DataService } from '@ghostfolio/client/services/data.service';
import { validateObjectForForm } from '@ghostfolio/client/util/form.util';
import { AccountWithValue } from '@ghostfolio/common/types';
import { GfAccountsSelectorComponent } from '@ghostfolio/ui/accounts-selector';

import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Inject,
  OnDestroy
} from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  ValidationErrors,
  Validators
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { StatusCodes } from 'http-status-codes';
import { EMPTY, Subject, catchError, takeUntil } from 'rxjs';

import { CreateOrUpdateAccessDialogParams } from './interfaces/interfaces';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'h-100' },
  imports: [
    FormsModule,
    GfAccountsSelectorComponent,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    ReactiveFormsModule
  ],
  selector: 'gf-create-or-update-access-dialog',
  styleUrls: ['./create-or-update-access-dialog.scss'],
  templateUrl: 'create-or-update-access-dialog.html'
})
export class GfCreateOrUpdateAccessDialog implements OnDestroy {
  public accessForm: FormGroup;
  public accounts: AccountWithValue[] = [];

  private unsubscribeSubject = new Subject<void>();

  public constructor(
    private changeDetectorRef: ChangeDetectorRef,
    @Inject(MAT_DIALOG_DATA) private data: CreateOrUpdateAccessDialogParams,
    public dialogRef: MatDialogRef<GfCreateOrUpdateAccessDialog>,
    private dataService: DataService,
    private formBuilder: FormBuilder,
    private notificationService: NotificationService
  ) {}

  public ngOnInit() {
    this.accessForm = this.formBuilder.group({
      alias: [this.data.access.alias],
      permissions: [this.data.access.permissions[0], Validators.required],
      type: [this.data.access.type, Validators.required],
      granteeUserId: [this.data.access.grantee, Validators.required],
      accounts: [[]]
    });

    // Fetch accounts for the selector
    this.dataService
      .fetchAccounts()
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe(({ accounts }) => {
        this.accounts = accounts;
        this.changeDetectorRef.markForCheck();
      });

    this.accessForm.get('type').valueChanges.subscribe((accessType) => {
      const granteeUserIdControl = this.accessForm.get('granteeUserId');
      const permissionsControl = this.accessForm.get('permissions');
      const accountsControl = this.accessForm.get('accounts');

      if (accessType === 'PRIVATE') {
        granteeUserIdControl.setValidators(Validators.required);
        accountsControl.clearValidators();
      } else {
        granteeUserIdControl.clearValidators();
        permissionsControl.setValue(this.data.access.permissions[0]);
        // Require at least one account for public access
        accountsControl.setValidators([
          Validators.required,
          this.validateMinimumAccounts
        ]);
        // Mark as touched so validation message appears immediately
        accountsControl.markAsTouched();
      }

      granteeUserIdControl.updateValueAndValidity();
      accountsControl.updateValueAndValidity();

      this.changeDetectorRef.markForCheck();
    });

    // If initially set to PUBLIC, trigger validation immediately
    if (this.accessForm.get('type').value === 'PUBLIC') {
      const accountsControl = this.accessForm.get('accounts');
      accountsControl.setValidators([
        Validators.required,
        this.validateMinimumAccounts
      ]);
      accountsControl.markAsTouched();
      accountsControl.updateValueAndValidity();
    }
  }

  public onCancel() {
    this.dialogRef.close();
  }

  public onAccountsChanged(accounts: AccountWithValue[]) {
    const accountsControl = this.accessForm.get('accounts');
    accountsControl.setValue(accounts);
    accountsControl.markAsTouched();
  }

  private validateMinimumAccounts(
    control: AbstractControl
  ): ValidationErrors | null {
    const accounts = control.value;
    if (!accounts || accounts.length === 0) {
      return {
        minAccounts: {
          message: 'At least one account must be selected for public access'
        }
      };
    }
    return null;
  }

  public async onSubmit() {
    const selectedAccounts = this.accessForm.get('accounts').value || [];
    const access: CreateAccessDto = {
      accounts: selectedAccounts.map((account: AccountWithValue) => account.id),
      alias: this.accessForm.get('alias').value,
      granteeUserId: this.accessForm.get('granteeUserId').value,
      permissions: [this.accessForm.get('permissions').value]
    };

    try {
      await validateObjectForForm({
        classDto: CreateAccessDto,
        form: this.accessForm,
        object: access
      });

      this.dataService
        .postAccess(access)
        .pipe(
          catchError((error) => {
            if (error.status === StatusCodes.BAD_REQUEST) {
              this.notificationService.alert({
                title: $localize`Oops! Could not grant access.`
              });
            }

            return EMPTY;
          }),
          takeUntil(this.unsubscribeSubject)
        )
        .subscribe(() => {
          this.dialogRef.close(access);
        });
    } catch (error) {
      console.error(error);
    }
  }

  public ngOnDestroy() {
    this.unsubscribeSubject.next();
    this.unsubscribeSubject.complete();
  }
}

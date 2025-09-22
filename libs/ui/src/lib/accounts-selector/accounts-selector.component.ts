import { AccountWithValue } from '@ghostfolio/common/types';

import { COMMA, ENTER } from '@angular/cdk/keycodes';
import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  signal,
  ViewChild
} from '@angular/core';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import {
  MatAutocompleteModule,
  MatAutocompleteSelectedEvent
} from '@angular/material/autocomplete';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeOutline } from 'ionicons/icons';
import { BehaviorSubject, Subject, takeUntil } from 'rxjs';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    IonIcon,
    MatAutocompleteModule,
    MatChipsModule,
    MatFormFieldModule,
    MatInputModule,
    ReactiveFormsModule
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  selector: 'gf-accounts-selector',
  styleUrls: ['./accounts-selector.component.scss'],
  templateUrl: 'accounts-selector.component.html'
})
export class GfAccountsSelectorComponent
  implements OnInit, OnChanges, OnDestroy
{
  @Input() accounts: AccountWithValue[];
  @Input() accountsAvailable: AccountWithValue[];
  @Input() readonly = false;

  @Output() accountsChanged = new EventEmitter<AccountWithValue[]>();

  @ViewChild('accountInput') accountInput: ElementRef<HTMLInputElement>;

  public filteredOptions: Subject<AccountWithValue[]> = new BehaviorSubject([]);
  public readonly separatorKeysCodes: number[] = [COMMA, ENTER];
  public readonly accountInputControl = new FormControl('');
  public readonly accountsSelected = signal<AccountWithValue[]>([]);

  private unsubscribeSubject = new Subject<void>();

  public constructor() {
    this.accountInputControl.valueChanges
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe((value) => {
        this.filteredOptions.next(this.filterAccounts(value));
      });

    addIcons({ closeOutline });
  }

  public ngOnInit() {
    this.accountsSelected.set(this.accounts);
    this.updateFilters();
  }

  public ngOnChanges() {
    this.accountsSelected.set(this.accounts);
    this.updateFilters();
  }

  public onAddAccount(event: MatAutocompleteSelectedEvent) {
    const account = this.accountsAvailable.find(({ id }) => {
      return id === event.option.value;
    });

    if (account) {
      this.accountsSelected.update((accounts) => {
        return [...(accounts ?? []), account];
      });

      this.accountsChanged.emit(this.accountsSelected());
    }

    this.accountInput.nativeElement.value = '';
    this.accountInputControl.setValue(undefined);
  }

  public onRemoveAccount(accountToRemove: AccountWithValue) {
    this.accountsSelected.update((accounts) => {
      return accounts.filter(({ id }) => {
        return id !== accountToRemove.id;
      });
    });

    this.accountsChanged.emit(this.accountsSelected());
    this.updateFilters();
  }

  public ngOnDestroy() {
    this.unsubscribeSubject.next();
    this.unsubscribeSubject.complete();
  }

  private filterAccounts(value: string): AccountWithValue[] {
    if (!value || typeof value !== 'string') {
      return this.getAvailableAccounts();
    }

    const filterValue = value.toLowerCase();

    return this.getAvailableAccounts().filter(({ name }) => {
      return name.toLowerCase().includes(filterValue);
    });
  }

  private getAvailableAccounts(): AccountWithValue[] {
    const selectedAccountIds = this.accountsSelected().map(({ id }) => id);

    return (
      this.accountsAvailable?.filter(({ id }) => {
        return !selectedAccountIds.includes(id);
      }) ?? []
    );
  }

  private updateFilters() {
    this.filteredOptions.next(
      this.filterAccounts(this.accountInputControl.value)
    );
  }
}

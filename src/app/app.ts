import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { of, switchMap } from 'rxjs';

import {
  Appointment,
  AppointmentFilterField,
  AppointmentFilters,
  AppointmentFormValue,
  Space,
} from './appointment.model';
import { AppointmentService } from './appointment.service';
import { AccessService } from './access.service';
import { AuthService } from './auth.service';
import { Lessee, LesseeFormValue, LesseeType } from './lessee.model';
import { LesseeService } from './lessee.service';
import { UserAccess } from './user-access.model';

export type AppView = 'agenda' | 'novo-agendamento' | 'locatarios' | 'aprovacoes';

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  private readonly authService = inject(AuthService);
  private readonly accessService = inject(AccessService);
  private readonly appointmentService = inject(AppointmentService);
  private readonly lesseeService = inject(LesseeService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly accessProfile$ = this.authService.user$.pipe(
    switchMap((user) => (user ? this.accessService.watchUserAccess(user.uid) : of(null))),
  );
  private readonly rentDateFormatter = new Intl.DateTimeFormat('pt-BR');

  readonly spaces: Array<{ value: Space; label: string }> = [
    { value: 'Campo', label: 'Campo' },
    { value: 'Salao de festas', label: 'Salão de festas' },
    { value: 'Churrasqueira', label: 'Churrasqueira' },
    { value: 'Piscina', label: 'Piscina' },
  ];

  readonly lesseeTypes: Array<{ value: LesseeType; label: string }> = [
    { value: 'Associado', label: 'Associado' },
    { value: 'Externo', label: 'Externo' },
  ];

  readonly user = toSignal(this.authService.user$, { initialValue: null });
  readonly accessProfile = toSignal(this.accessProfile$, { initialValue: null });
  readonly isApproved = computed(() => this.accessProfile()?.status === 'approved');
  readonly appointments = toSignal(
    this.accessProfile$.pipe(
      switchMap((profile) =>
        profile?.status === 'approved' ? this.appointmentService.watchUpcomingAppointments() : of([]),
      ),
    ),
    { initialValue: [] },
  );
  readonly lessees = toSignal(
    this.accessProfile$.pipe(
      switchMap((profile) =>
        profile?.status === 'approved' ? this.lesseeService.watchLessees() : of([]),
      ),
    ),
    { initialValue: [] },
  );
  readonly pendingAccessRequests = toSignal(
    this.accessProfile$.pipe(
      switchMap((profile) =>
        profile?.status === 'approved' ? this.accessService.watchAccessRequests() : of([]),
      ),
    ),
    { initialValue: [] },
  );
  readonly filters = signal<AppointmentFilters>({
    scheduledAt: '',
    space: '',
    lesseeName: '',
    registeredBy: '',
  });
  readonly filterSearchQueries = signal<AppointmentFilters>({
    scheduledAt: '',
    space: '',
    lesseeName: '',
    registeredBy: '',
  });
  readonly openFilterDropdown = signal<AppointmentFilterField | null>(null);
  readonly editingId = signal<string | null>(null);
  readonly editingLesseeId = signal<string | null>(null);
  readonly isSaving = signal(false);
  readonly isSavingLessee = signal(false);
  readonly message = signal('');
  readonly error = signal('');
  readonly mobileMenuOpen = signal(false);
  readonly activeView = signal<AppView>('agenda');
  readonly lesseeSearchQuery = signal('');
  readonly lesseePickerOpen = signal(false);

  readonly appointmentForm = this.formBuilder.nonNullable.group({
    scheduledAt: ['', Validators.required],
    space: ['Campo' as Space, Validators.required],
    lesseeId: ['', Validators.required],
    registeredBy: ['', [Validators.required, Validators.maxLength(120)]],
  });

  readonly lesseeForm = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    type: ['Associado' as LesseeType, Validators.required],
  });

  readonly hasActiveFilters = computed(() => {
    const filters = this.filters();

    return !!(
      filters.scheduledAt ||
      filters.space ||
      filters.lesseeName ||
      filters.registeredBy
    );
  });

  readonly filteredAppointments = computed(() => {
    const filters = this.filters();

    const filtered = this.appointments().filter((appointment) => {
      return (
        this.matchesRentDate(appointment.scheduledAt, filters.scheduledAt) &&
        this.matchesExact(this.formatSpace(appointment.space), filters.space) &&
        this.matchesExact(appointment.lesseeName, filters.lesseeName) &&
        this.matchesExact(appointment.registeredBy, filters.registeredBy)
      );
    });

    return this.hasActiveFilters() ? filtered : filtered.slice(0, 10);
  });

  readonly filterDateOptions = computed(() =>
    this.getUniqueSortedValues(this.appointments().map((appointment) => this.formatRentDate(appointment.scheduledAt))),
  );

  readonly filterRegisteredByOptions = computed(() =>
    this.getUniqueSortedValues(this.appointments().map((appointment) => appointment.registeredBy)),
  );

  readonly displayedUpcomingCount = computed(() => {
    if (this.hasActiveFilters()) {
      return this.filteredAppointments().length;
    }

    return Math.min(10, this.appointments().length);
  });

  readonly filteredLesseesForPicker = computed(() => {
    const query = this.lesseeSearchQuery().trim().toLowerCase();

    if (!query) {
      return this.lessees();
    }

    return this.lessees().filter((lessee) => lessee.name.toLowerCase().includes(query));
  });

  readonly selectedLesseeLabel = computed(() => {
    const lesseeId = this.appointmentForm.controls.lesseeId.value;
    const lessee = this.lessees().find((item) => item.id === lesseeId);

    return lessee ? `${lessee.name} (${lessee.type})` : '';
  });

  constructor() {
    effect(() => {
      const user = this.user();

      if (user) {
        void this.accessService.ensureAccessRequest(user);
      }

      if (user && !this.editingId()) {
        this.appointmentForm.controls.registeredBy.setValue(this.currentUserName());
      }
    });
  }

  async signIn(): Promise<void> {
    this.clearAlerts();

    try {
      await this.authService.signInWithGoogle();
    } catch (error) {
      this.error.set(this.getErrorMessage(error));
    }
  }

  async signOut(): Promise<void> {
    this.closeMobileMenu();
    await this.authService.signOut();
    this.resetForm();
    this.resetLesseeForm();
    this.setActiveView('agenda');
  }

  async saveAppointment(): Promise<void> {
    this.clearAlerts();

    if (this.appointmentForm.invalid) {
      this.appointmentForm.markAllAsTouched();
      this.error.set('Preencha todos os campos obrigatórios antes de salvar.');
      return;
    }

    const user = this.user();
    if (!user || !this.isApproved()) {
      this.error.set('Seu usuário precisa estar autorizado para salvar agendamentos.');
      return;
    }

    const value = this.getAppointmentFormValue();
    if (!value.lesseeName) {
      this.error.set('Selecione um locatário válido.');
      return;
    }

    this.isSaving.set(true);

    try {
      const editingId = this.editingId();

      if (editingId) {
        await this.appointmentService.updateAppointment(editingId, value);
        this.message.set('Agendamento atualizado com sucesso.');
      } else {
        await this.appointmentService.createAppointment(value, user);
        this.message.set('Agendamento criado com sucesso.');
      }

      this.resetForm();
      this.setActiveView('agenda');
    } catch (error) {
      this.error.set(this.getErrorMessage(error));
    } finally {
      this.isSaving.set(false);
    }
  }

  async saveLessee(): Promise<void> {
    this.clearAlerts();

    if (this.lesseeForm.invalid) {
      this.lesseeForm.markAllAsTouched();
      this.error.set('Preencha todos os campos do locatário antes de salvar.');
      return;
    }

    const user = this.user();
    if (!user || !this.isApproved()) {
      this.error.set('Seu usuário precisa estar autorizado para salvar locatários.');
      return;
    }

    const value = this.getLesseeFormValue();
    this.isSavingLessee.set(true);

    try {
      const editingLesseeId = this.editingLesseeId();

      if (editingLesseeId) {
        await this.lesseeService.updateLessee(editingLesseeId, value);
        this.message.set('Locatário atualizado com sucesso.');
      } else {
        await this.lesseeService.createLessee(value, user);
        this.message.set('Locatário cadastrado com sucesso.');
      }

      this.resetLesseeForm();
    } catch (error) {
      this.error.set(this.getErrorMessage(error));
    } finally {
      this.isSavingLessee.set(false);
    }
  }

  editAppointment(appointment: Appointment): void {
    this.clearAlerts();
    this.setActiveView('novo-agendamento');
    this.editingId.set(appointment.id);
    this.appointmentForm.setValue({
      scheduledAt: this.toDateTimeLocalValue(appointment.scheduledAt),
      space: appointment.space,
      lesseeId: appointment.lesseeId,
      registeredBy: appointment.registeredBy,
    });
    this.lesseeSearchQuery.set(appointment.lesseeName);
    this.lesseePickerOpen.set(false);
  }

  editLessee(lessee: Lessee): void {
    this.clearAlerts();
    this.editingLesseeId.set(lessee.id);
    this.lesseeForm.setValue({
      name: lessee.name,
      type: lessee.type,
    });
  }

  async deleteAppointment(appointment: Appointment): Promise<void> {
    this.clearAlerts();

    const confirmed = window.confirm(`Excluir o agendamento de ${appointment.lesseeName}?`);
    if (!confirmed) {
      return;
    }

    try {
      await this.appointmentService.deleteAppointment(appointment.id);
      this.message.set('Agendamento excluído com sucesso.');
    } catch (error) {
      this.error.set(this.getErrorMessage(error));
    }
  }

  async deleteLessee(lessee: Lessee): Promise<void> {
    this.clearAlerts();

    const confirmed = window.confirm(`Excluir o locatário ${lessee.name}?`);
    if (!confirmed) {
      return;
    }

    try {
      await this.lesseeService.deleteLessee(lessee.id);
      this.message.set('Locatário excluído com sucesso.');

      if (this.editingLesseeId() === lessee.id) {
        this.resetLesseeForm();
      }

      if (this.appointmentForm.controls.lesseeId.value === lessee.id) {
        this.appointmentForm.controls.lesseeId.setValue('');
        this.lesseeSearchQuery.set('');
      }
    } catch (error) {
      this.error.set(this.getErrorMessage(error));
    }
  }

  async approveAccess(request: UserAccess): Promise<void> {
    this.clearAlerts();

    const user = this.user();
    if (!user || !this.isApproved()) {
      this.error.set('Seu usuário precisa estar autorizado para aprovar novos acessos.');
      return;
    }

    try {
      await this.accessService.approveUser(request, user);
      this.message.set(`${request.displayName || request.email} foi autorizado com sucesso.`);
    } catch (error) {
      this.error.set(this.getErrorMessage(error));
    }
  }

  cancelEdit(): void {
    this.resetForm();
    this.setActiveView('agenda');
  }

  setActiveView(view: AppView): void {
    this.activeView.set(view);
  }

  cancelLesseeEdit(): void {
    this.resetLesseeForm();
  }

  updateFilter(field: keyof AppointmentFilters, value: string): void {
    this.filters.update((current) => ({ ...current, [field]: value }));
  }

  clearFilters(): void {
    this.filters.set({
      scheduledAt: '',
      space: '',
      lesseeName: '',
      registeredBy: '',
    });
    this.filterSearchQueries.set({
      scheduledAt: '',
      space: '',
      lesseeName: '',
      registeredBy: '',
    });
    this.openFilterDropdown.set(null);
  }

  openFilterDropdownPicker(field: AppointmentFilterField): void {
    this.openFilterDropdown.set(field);
  }

  closeFilterDropdownPicker(): void {
    setTimeout(() => this.openFilterDropdown.set(null), 150);
  }

  onFilterSearchInput(field: AppointmentFilterField, value: string): void {
    this.filterSearchQueries.update((current) => ({ ...current, [field]: value }));
    this.openFilterDropdown.set(field);

    if (this.filters()[field] && value !== this.filters()[field]) {
      this.updateFilter(field, '');
    }
  }

  selectFilterOption(field: AppointmentFilterField, value: string): void {
    this.updateFilter(field, value);
    this.filterSearchQueries.update((current) => ({ ...current, [field]: value }));
    this.openFilterDropdown.set(null);
  }

  clearFilterOption(field: AppointmentFilterField): void {
    this.updateFilter(field, '');
    this.filterSearchQueries.update((current) => ({ ...current, [field]: '' }));
  }

  filteredFilterOptions(field: AppointmentFilterField): string[] {
    const query = this.filterSearchQueries()[field].trim().toLowerCase();
    const options = this.getFilterOptions(field);

    if (!query) {
      return options;
    }

    return options.filter((option) => option.toLowerCase().includes(query));
  }

  formatRentDate(date: Date): string {
    return this.rentDateFormatter.format(date);
  }

  openLesseePicker(): void {
    this.lesseePickerOpen.set(true);
  }

  closeLesseePicker(): void {
    setTimeout(() => this.lesseePickerOpen.set(false), 150);
  }

  onLesseeSearchInput(value: string): void {
    this.lesseeSearchQuery.set(value);
    this.lesseePickerOpen.set(true);

    const selectedLessee = this.lessees().find(
      (lessee) => lessee.id === this.appointmentForm.controls.lesseeId.value,
    );

    if (selectedLessee && value !== selectedLessee.name && value !== this.selectedLesseeLabel()) {
      this.appointmentForm.controls.lesseeId.setValue('');
    }
  }

  selectLesseeForAppointment(lessee: Lessee): void {
    this.appointmentForm.controls.lesseeId.setValue(lessee.id);
    this.lesseeSearchQuery.set(lessee.name);
    this.lesseePickerOpen.set(false);
    this.appointmentForm.controls.lesseeId.markAsTouched();
  }

  clearLesseeSelection(): void {
    this.appointmentForm.controls.lesseeId.setValue('');
    this.lesseeSearchQuery.set('');
    this.lesseePickerOpen.set(false);
  }

  openMobileMenu(): void {
    this.mobileMenuOpen.set(true);
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }

  formatSpace(space: Space): string {
    return this.spaces.find((option) => option.value === space)?.label ?? space;
  }

  trackByAppointmentId(_index: number, appointment: Appointment): string {
    return appointment.id;
  }

  trackByLesseeId(_index: number, lessee: Lessee): string {
    return lessee.id;
  }

  private resetForm(): void {
    this.editingId.set(null);
    this.appointmentForm.reset({
      scheduledAt: '',
      space: 'Campo',
      lesseeId: '',
      registeredBy: this.currentUserName(),
    });
    this.lesseeSearchQuery.set('');
    this.lesseePickerOpen.set(false);
  }

  private resetLesseeForm(): void {
    this.editingLesseeId.set(null);
    this.lesseeForm.reset({
      name: '',
      type: 'Associado',
    });
  }

  private currentUserName(): string {
    const user = this.user();
    return user?.displayName || user?.email || '';
  }

  private getAppointmentFormValue(): AppointmentFormValue {
    const rawValue = this.appointmentForm.getRawValue();
    const lessee = this.lessees().find((item) => item.id === rawValue.lesseeId);

    return {
      scheduledAt: new Date(rawValue.scheduledAt),
      space: rawValue.space,
      lesseeId: rawValue.lesseeId,
      lesseeName: lessee?.name ?? this.lesseeSearchQuery().trim(),
      registeredBy: this.editingId() ? rawValue.registeredBy : this.currentUserName(),
    };
  }

  private getLesseeFormValue(): LesseeFormValue {
    return this.lesseeForm.getRawValue();
  }

  private getFilterOptions(field: AppointmentFilterField): string[] {
    switch (field) {
      case 'scheduledAt':
        return this.filterDateOptions();
      case 'registeredBy':
        return this.filterRegisteredByOptions();
      case 'space':
      case 'lesseeName':
        return [];
    }
  }

  private getUniqueSortedValues(values: string[]): string[] {
    return [...new Set(values.filter((value) => value.trim()))].sort((left, right) =>
      left.localeCompare(right, 'pt-BR'),
    );
  }

  private matchesExact(value: string, filter: string): boolean {
    if (!filter.trim()) {
      return true;
    }

    return value === filter;
  }

  private matchesRentDate(value: Date, filter: string): boolean {
    if (!filter.trim()) {
      return true;
    }

    return this.formatRentDate(value) === filter;
  }

  private toDateTimeLocalValue(date: Date): string {
    const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return offsetDate.toISOString().slice(0, 16);
  }

  private clearAlerts(): void {
    this.message.set('');
    this.error.set('');
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Não foi possível concluir a operação.';
  }
}

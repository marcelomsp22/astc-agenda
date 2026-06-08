import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { of, switchMap } from 'rxjs';

import { Appointment, AppointmentFilters, AppointmentFormValue, Space } from './appointment.model';
import { AppointmentService } from './appointment.service';
import { AccessService } from './access.service';
import { AuthService } from './auth.service';
import { UserAccess } from './user-access.model';

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
  private readonly formBuilder = inject(FormBuilder);
  private readonly accessProfile$ = this.authService.user$.pipe(
    switchMap((user) => (user ? this.accessService.watchUserAccess(user.uid) : of(null))),
  );
  private readonly dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });

  readonly spaces: Array<{ value: Space; label: string }> = [
    { value: 'Campo', label: 'Campo' },
    { value: 'Salao de festas', label: 'Salão de festas' },
    { value: 'Churrasqueira', label: 'Churrasqueira' },
    { value: 'Piscina', label: 'Piscina' },
  ];

  readonly user = toSignal(this.authService.user$, { initialValue: null });
  readonly accessProfile = toSignal(this.accessProfile$, { initialValue: null });
  readonly isApproved = computed(() => this.accessProfile()?.status === 'approved');
  readonly appointments = toSignal(
    this.accessProfile$.pipe(
      switchMap((profile) =>
        profile?.status === 'approved' ? this.appointmentService.watchRecentAppointments() : of([]),
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
    renter: '',
    registeredBy: '',
    createdAt: '',
  });
  readonly editingId = signal<string | null>(null);
  readonly isSaving = signal(false);
  readonly message = signal('');
  readonly error = signal('');
  readonly mobileMenuOpen = signal(false);

  readonly appointmentForm = this.formBuilder.nonNullable.group({
    scheduledAt: ['', Validators.required],
    space: ['Campo' as Space, Validators.required],
    renter: ['', [Validators.required, Validators.maxLength(120)]],
    registeredBy: ['', [Validators.required, Validators.maxLength(120)]],
  });

  readonly filteredAppointments = computed(() => {
    const filters = this.filters();

    return this.appointments().filter((appointment) => {
      return (
        this.includesDate(appointment.scheduledAt, filters.scheduledAt) &&
        this.includesText(this.formatSpace(appointment.space), filters.space) &&
        this.includesText(appointment.renter, filters.renter) &&
        this.includesText(appointment.registeredBy, filters.registeredBy) &&
        this.includesDate(appointment.createdAt, filters.createdAt)
      );
    });
  });

  constructor() {
    effect(() => {
      const user = this.user();

      if (user) {
        void this.accessService.ensureAccessRequest(user);
      }

      if (user && !this.editingId() && !this.appointmentForm.controls.registeredBy.value) {
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

    const value = this.getFormValue();
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
    } catch (error) {
      this.error.set(this.getErrorMessage(error));
    } finally {
      this.isSaving.set(false);
    }
  }

  editAppointment(appointment: Appointment): void {
    this.clearAlerts();
    this.editingId.set(appointment.id);
    this.appointmentForm.setValue({
      scheduledAt: this.toDateTimeLocalValue(appointment.scheduledAt),
      space: appointment.space,
      renter: appointment.renter,
      registeredBy: appointment.registeredBy,
    });
  }

  async deleteAppointment(appointment: Appointment): Promise<void> {
    this.clearAlerts();

    const confirmed = window.confirm(`Excluir o agendamento de ${appointment.renter}?`);
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
  }

  updateFilter(field: keyof AppointmentFilters, value: string): void {
    this.filters.update((current) => ({ ...current, [field]: value }));
  }

  clearFilters(): void {
    this.filters.set({
      scheduledAt: '',
      space: '',
      renter: '',
      registeredBy: '',
      createdAt: '',
    });
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

  private resetForm(): void {
    this.editingId.set(null);
    this.appointmentForm.reset({
      scheduledAt: '',
      space: 'Campo',
      renter: '',
      registeredBy: this.currentUserName(),
    });
  }

  private currentUserName(): string {
    const user = this.user();
    return user?.displayName || user?.email || '';
  }

  private getFormValue(): AppointmentFormValue {
    const rawValue = this.appointmentForm.getRawValue();

    return {
      scheduledAt: new Date(rawValue.scheduledAt),
      space: rawValue.space,
      renter: rawValue.renter,
      registeredBy: rawValue.registeredBy,
    };
  }

  private includesText(value: string, filter: string): boolean {
    return value.toLowerCase().includes(filter.trim().toLowerCase());
  }

  private includesDate(value: Date, filter: string): boolean {
    if (!filter.trim()) {
      return true;
    }

    return this.dateTimeFormatter.format(value).toLowerCase().includes(filter.trim().toLowerCase());
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

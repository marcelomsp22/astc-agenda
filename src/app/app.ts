import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { BehaviorSubject, combineLatest, of, switchMap } from 'rxjs';

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
  private readonly appliedFilters$ = new BehaviorSubject<AppointmentFilters>(this.createEmptyFilters());
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

  readonly rentMonths: Array<{ value: string; label: string }> = [
    { value: '01', label: 'Janeiro' },
    { value: '02', label: 'Fevereiro' },
    { value: '03', label: 'Março' },
    { value: '04', label: 'Abril' },
    { value: '05', label: 'Maio' },
    { value: '06', label: 'Junho' },
    { value: '07', label: 'Julho' },
    { value: '08', label: 'Agosto' },
    { value: '09', label: 'Setembro' },
    { value: '10', label: 'Outubro' },
    { value: '11', label: 'Novembro' },
    { value: '12', label: 'Dezembro' },
  ];

  readonly rentYearOptions = this.buildRentYearOptions();

  readonly user = toSignal(this.authService.user$, { initialValue: null });
  readonly accessProfile = toSignal(this.accessProfile$, { initialValue: null });
  readonly isApproved = computed(() => this.accessProfile()?.status === 'approved');
  readonly filters = signal<AppointmentFilters>(this.createEmptyFilters());
  readonly pendingFilters = signal<AppointmentFilters>(this.createDefaultPendingFilters());
  readonly filterSearchQueries = signal<AppointmentFilters>(this.createEmptyFilters());
  readonly appointments = toSignal(
    combineLatest([this.accessProfile$, this.appliedFilters$]).pipe(
      switchMap(([profile, filters]) => {
        if (profile?.status !== 'approved') {
          return of([]);
        }

        if (filters.rentYear && filters.rentMonth) {
          return this.appointmentService.watchAppointmentsByMonth(
            Number(filters.rentYear),
            Number(filters.rentMonth),
          );
        }

        if (filters.rentYear) {
          return this.appointmentService.watchAppointmentsByYear(Number(filters.rentYear));
        }

        return this.appointmentService.watchUpcomingAppointments();
      }),
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
  readonly openFilterDropdown = signal<AppointmentFilterField | null>(null);
  readonly editingId = signal<string | null>(null);
  readonly editingLesseeId = signal<string | null>(null);
  readonly isSaving = signal(false);
  readonly isSavingLessee = signal(false);
  readonly message = signal('');
  readonly error = signal('');
  readonly mobileMenuOpen = signal(false);
  readonly sidebarCollapsed = signal(this.readSidebarCollapsedPreference());
  readonly activeView = signal<AppView>('agenda');
  readonly lesseeSearchQuery = signal('');
  readonly lesseePickerOpen = signal(false);

  readonly appointmentForm = this.formBuilder.nonNullable.group({
    scheduledAt: ['', Validators.required],
    space: ['Campo' as Space, Validators.required],
    lesseeId: ['', Validators.required],
    description: ['', [Validators.required, Validators.maxLength(500)]],
    registeredBy: ['', [Validators.required, Validators.maxLength(120)]],
  });

  readonly lesseeForm = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    type: ['Associado' as LesseeType, Validators.required],
  });

  readonly hasActiveFilters = computed(() => {
    const filters = this.filters();

    return !!(
      filters.rentYear ||
      filters.space ||
      filters.lesseeName ||
      filters.registeredBy
    );
  });

  readonly filteredAppointments = computed(() => {
    const filters = this.filters();

    const filtered = this.appointments().filter((appointment) => {
      return (
        this.matchesRentPeriod(appointment.scheduledAt, filters.rentYear, filters.rentMonth) &&
        this.matchesExact(this.formatSpace(appointment.space), filters.space) &&
        this.matchesExact(appointment.lesseeName, filters.lesseeName) &&
        this.matchesExact(appointment.registeredBy, filters.registeredBy)
      );
    });

    return this.hasActiveFilters() ? filtered : filtered.slice(0, 10);
  });

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
      description: appointment.description,
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
    this.pendingFilters.update((current) => ({ ...current, [field]: value }));
  }

  updateRentPeriodFilter(field: 'rentYear' | 'rentMonth', value: string): void {
    this.pendingFilters.update((current) => ({ ...current, [field]: value }));
    this.applyFilters();
  }

  applyFilters(): void {
    this.syncAppliedFilters({ ...this.pendingFilters() });
    this.openFilterDropdown.set(null);
  }

  clearFilters(): void {
    const emptyFilters = this.createEmptyFilters();

    this.syncAppliedFilters(emptyFilters);
    this.pendingFilters.set(this.createDefaultPendingFilters());
    this.filterSearchQueries.set(emptyFilters);
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

    if (this.pendingFilters()[field] && value !== this.pendingFilters()[field]) {
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

  toggleSidebar(): void {
    const collapsed = !this.sidebarCollapsed();
    this.sidebarCollapsed.set(collapsed);
    this.persistSidebarCollapsedPreference(collapsed);
  }

  private readSidebarCollapsedPreference(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }

    return window.localStorage.getItem('astc-sidebar-collapsed') === 'true';
  }

  private persistSidebarCollapsedPreference(collapsed: boolean): void {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem('astc-sidebar-collapsed', String(collapsed));
  }

  formatSpace(space: Space): string {
    return this.spaces.find((option) => option.value === space)?.label ?? space;
  }

  printAppointmentsReport(): void {
    if (typeof window === 'undefined') {
      return;
    }

    const appointments = this.filteredAppointments();

    if (!appointments.length) {
      this.error.set('Não há agendamentos para imprimir.');
      return;
    }

    const reportUrl = URL.createObjectURL(
      new Blob([this.buildAppointmentsReportHtml(appointments)], {
        type: 'text/html;charset=utf-8',
      }),
    );

    const printWindow = window.open(reportUrl, '_blank');

    if (!printWindow) {
      URL.revokeObjectURL(reportUrl);
      this.error.set('Não foi possível abrir a janela de impressão. Verifique o bloqueador de pop-ups.');
      return;
    }

    let didPrint = false;

    const triggerPrint = (): void => {
      if (didPrint || printWindow.closed) {
        return;
      }

      didPrint = true;
      printWindow.focus();
      printWindow.print();
    };

    printWindow.addEventListener('load', triggerPrint, { once: true });
    window.setTimeout(triggerPrint, 800);
    window.setTimeout(() => URL.revokeObjectURL(reportUrl), 60_000);
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
      description: '',
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
      description: rawValue.description,
      registeredBy: this.editingId() ? rawValue.registeredBy : this.currentUserName(),
    };
  }

  private getLesseeFormValue(): LesseeFormValue {
    return this.lesseeForm.getRawValue();
  }

  private getFilterOptions(field: AppointmentFilterField): string[] {
    switch (field) {
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

  private matchesRentPeriod(value: Date, year: string, month: string): boolean {
    if (!year.trim()) {
      return true;
    }

    if (value.getFullYear() !== Number(year)) {
      return false;
    }

    if (!month.trim()) {
      return true;
    }

    return String(value.getMonth() + 1).padStart(2, '0') === month;
  }

  private buildRentYearOptions(): number[] {
    const years: number[] = [];

    for (let year = 2036; year >= 2026; year -= 1) {
      years.push(year);
    }

    return years;
  }

  private createEmptyFilters(): AppointmentFilters {
    return {
      rentYear: '',
      rentMonth: '',
      space: '',
      lesseeName: '',
      registeredBy: '',
    };
  }

  private createDefaultPendingFilters(): AppointmentFilters {
    const now = new Date();

    return {
      rentYear: String(now.getFullYear()),
      rentMonth: String(now.getMonth() + 1).padStart(2, '0'),
      space: '',
      lesseeName: '',
      registeredBy: '',
    };
  }

  private syncAppliedFilters(filters: AppointmentFilters): void {
    this.filters.set(filters);
    this.appliedFilters$.next(filters);
  }

  private readonly reportChartColors = [
    '#003db7',
    '#e1130b',
    '#1a7f37',
    '#f59e0b',
    '#7c3aed',
    '#0891b2',
    '#be185d',
    '#64748b',
  ];

  private buildAppointmentsReportHtml(appointments: Appointment[]): string {
    const logoUrl = `${window.location.origin}/astc-logo.png`;
    const periodLabel = this.getReportPeriodLabel();
    const chartsHtml = this.buildReportChartsHtml(appointments);
    const rows = appointments
      .map(
        (appointment) => `
          <tr>
            <td>${this.escapeHtml(this.formatRentDate(appointment.scheduledAt))}</td>
            <td>${this.escapeHtml(this.formatSpace(appointment.space))}</td>
            <td>${this.escapeHtml(appointment.lesseeName)}</td>
            <td>${this.escapeHtml(appointment.registeredBy)}</td>
            <td>${this.escapeHtml(appointment.description || '—')}</td>
          </tr>
        `,
      )
      .join('');

    return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>Relatório de Agendamentos - ASTC</title>
    <style>
      @page {
        margin: 18mm 14mm;
      }

      body {
        color: #172033;
        font-family: Arial, Helvetica, sans-serif;
        margin: 0;
      }

      .report-header {
        align-items: center;
        border-bottom: 2px solid #003db7;
        display: flex;
        gap: 1rem;
        margin-bottom: 1.5rem;
        padding-bottom: 1rem;
      }

      .report-header img {
        height: 72px;
        object-fit: contain;
        width: 94px;
      }

      .report-header h1 {
        color: #003db7;
        font-size: 1.5rem;
        margin: 0 0 0.35rem;
      }

      .report-header p {
        color: #5d6b82;
        margin: 0;
      }

      table {
        border-collapse: collapse;
        width: 100%;
      }

      th,
      td {
        border: 1px solid #ccd7e8;
        font-size: 0.92rem;
        padding: 0.65rem 0.75rem;
        text-align: left;
        vertical-align: top;
      }

      th {
        background: #eef3fb;
        color: #003db7;
      }

      tbody tr:nth-child(even) {
        background: #f9fbff;
      }

      .report-charts {
        margin-top: 2rem;
      }

      .chart-card {
        border: 1px solid #ccd7e8;
        border-radius: 16px;
        padding: 1rem;
      }

      .chart-card h2 {
        color: #003db7;
        font-size: 1rem;
        margin: 0 0 1rem;
      }

      .chart-content {
        align-items: center;
        display: flex;
        gap: 1rem;
        justify-content: center;
      }

      .pie-chart {
        border-radius: 50%;
        flex-shrink: 0;
        height: 160px;
        width: 160px;
      }

      .chart-legend {
        list-style: none;
        margin: 0;
        padding: 0;
      }

      .chart-legend li {
        align-items: center;
        display: flex;
        font-size: 0.84rem;
        gap: 0.5rem;
        margin-bottom: 0.45rem;
      }

      .chart-legend span {
        border-radius: 50%;
        display: inline-block;
        flex-shrink: 0;
        height: 12px;
        width: 12px;
      }

      .report-footer {
        border-top: 1px solid #ccd7e8;
        color: #43506a;
        font-size: 0.88rem;
        line-height: 1.5;
        margin-top: 2rem;
        padding-top: 1rem;
        text-align: center;
      }

      @media print {
        .report-charts {
          break-inside: avoid;
          page-break-inside: avoid;
        }
      }
    </style>
  </head>
  <body>
    <header class="report-header">
      <img src="${logoUrl}" alt="Logotipo ASTC" />
      <div>
        <h1>Relatório de Agendamentos</h1>
        ${periodLabel ? `<p>${this.escapeHtml(periodLabel)}</p>` : ''}
      </div>
    </header>

    <table>
      <thead>
        <tr>
          <th>Data do Aluguel</th>
          <th>Espaço</th>
          <th>Locatário</th>
          <th>Responsável</th>
          <th>Descrição</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>

    ${chartsHtml}

    <footer class="report-footer">
      <strong>Associação Saúde, Trabalho e Cultura - ASTC</strong><br />
      Rua das Camélias, 5572, bairro Jardim Eldorado, CEP 76811-864 - Porto Velho-RO
    </footer>
  </body>
</html>`;
  }

  private buildReportChartsHtml(appointments: Appointment[]): string {
    const byYearMonth = this.aggregateAppointmentsByYearMonth(appointments);

    return `
      <section class="report-charts">
        <article class="chart-card">
          <h2>Agendamentos por mês e ano</h2>
          ${this.buildPieChartHtml(byYearMonth)}
        </article>
      </section>
    `;
  }

  private aggregateAppointmentsByYearMonth(
    appointments: Appointment[],
  ): Array<{ label: string; value: number }> {
    const counts = new Map<string, number>();

    for (const appointment of appointments) {
      const year = appointment.scheduledAt.getFullYear();
      const monthValue = String(appointment.scheduledAt.getMonth() + 1).padStart(2, '0');
      const key = `${year}-${monthValue}`;

      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    return [...counts.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => {
        const [year, monthValue] = key.split('-');
        const monthLabel =
          this.rentMonths.find((month) => month.value === monthValue)?.label ?? monthValue;

        return {
          label: `${monthLabel}/${year}`,
          value,
        };
      });
  }

  private buildPieChartHtml(items: Array<{ label: string; value: number }>): string {
    const total = items.reduce((sum, item) => sum + item.value, 0);

    if (!total) {
      return '<p>Sem dados para exibir.</p>';
    }

    let current = 0;
    const gradientSegments = items.map((item, index) => {
      const start = (current / total) * 100;
      current += item.value;
      const end = (current / total) * 100;
      const color = this.reportChartColors[index % this.reportChartColors.length];

      return `${color} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
    });

    const legend = items
      .map((item, index) => {
        const color = this.reportChartColors[index % this.reportChartColors.length];
        const percentage = ((item.value / total) * 100).toFixed(1);

        return `
          <li>
            <span style="background:${color}"></span>
            ${this.escapeHtml(item.label)} (${item.value} · ${percentage}%)
          </li>
        `;
      })
      .join('');

    return `
      <div class="chart-content">
        <div class="pie-chart" style="background:conic-gradient(${gradientSegments.join(', ')});"></div>
        <ul class="chart-legend">${legend}</ul>
      </div>
    `;
  }

  private getReportPeriodLabel(): string {
    const filters = this.filters();

    if (!filters.rentYear) {
      return '';
    }

    const monthLabel = filters.rentMonth
      ? (this.rentMonths.find((month) => month.value === filters.rentMonth)?.label ??
        filters.rentMonth)
      : 'Todos os meses';

    return `${monthLabel} de ${filters.rentYear}`;
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
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
    const message = error instanceof Error ? error.message : 'Não foi possível concluir a operação.';

    if (/missing or insufficient permissions/i.test(message)) {
      return 'Permissão negada no Firestore. Verifique se seu usuário está aprovado e publique as regras atualizadas com: npm run firestore:rules:deploy';
    }

    return message;
  }
}

import { Timestamp } from '@angular/fire/firestore';

export type Space = 'Campo' | 'Salao de festas' | 'Churrasqueira' | 'Piscina';

export interface Appointment {
  id: string;
  scheduledAt: Date;
  space: Space;
  lesseeId: string;
  lesseeName: string;
  description: string;
  registeredBy: string;
  createdAt: Date;
  createdByUid: string;
  createdByName: string;
}

export interface AppointmentFormValue {
  scheduledAt: Date;
  space: Space;
  lesseeId: string;
  lesseeName: string;
  description: string;
  registeredBy: string;
}

export interface AppointmentDocument {
  scheduledAt: Timestamp | Date | string;
  space: Space;
  lesseeId?: string;
  lesseeName?: string;
  description?: string;
  renter?: string;
  registeredBy: string;
  createdAt: Timestamp | Date | string;
  createdByUid: string;
  createdByName: string;
}

export type AppointmentFilterField = 'scheduledAt' | 'space' | 'lesseeName' | 'registeredBy';

export interface AppointmentFilters {
  scheduledAt: string;
  space: string;
  lesseeName: string;
  registeredBy: string;
}

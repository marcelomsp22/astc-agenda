import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  Timestamp,
  addDoc,
  collection,
  collectionData,
  deleteDoc,
  doc,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from '@angular/fire/firestore';
import { User } from 'firebase/auth';
import { Observable, map } from 'rxjs';

import { Appointment, AppointmentDocument, AppointmentFormValue } from './appointment.model';

@Injectable({
  providedIn: 'root',
})
export class AppointmentService {
  private readonly firestore = inject(Firestore);
  private readonly collectionRef = collection(this.firestore, 'appointments');

  watchRecentAppointments(): Observable<Appointment[]> {
    return collectionData(query(this.collectionRef, orderBy('createdAt', 'desc'), limit(10)), {
      idField: 'id',
    }).pipe(map((appointments) => appointments.map((appointment) => this.fromDocument(appointment))));
  }

  async createAppointment(value: AppointmentFormValue, user: User): Promise<void> {
    await addDoc(this.collectionRef, {
      scheduledAt: Timestamp.fromDate(value.scheduledAt),
      space: value.space,
      renter: value.renter.trim(),
      registeredBy: value.registeredBy.trim(),
      createdAt: serverTimestamp(),
      createdByUid: user.uid,
      createdByName: user.displayName || user.email || 'Usuario Google',
    });
  }

  async updateAppointment(id: string, value: AppointmentFormValue): Promise<void> {
    await updateDoc(doc(this.firestore, 'appointments', id), {
      scheduledAt: Timestamp.fromDate(value.scheduledAt),
      space: value.space,
      renter: value.renter.trim(),
      registeredBy: value.registeredBy.trim(),
      updatedAt: serverTimestamp(),
    });
  }

  async deleteAppointment(id: string): Promise<void> {
    await deleteDoc(doc(this.firestore, 'appointments', id));
  }

  private fromDocument(raw: unknown): Appointment {
    const data = raw as AppointmentDocument & { id: string };

    return {
      id: data.id,
      scheduledAt: this.toDate(data.scheduledAt),
      space: data.space,
      renter: data.renter,
      registeredBy: data.registeredBy,
      createdAt: this.toDate(data.createdAt),
      createdByUid: data.createdByUid,
      createdByName: data.createdByName,
    };
  }

  private toDate(value: Timestamp | Date | string): Date {
    if (value instanceof Timestamp) {
      return value.toDate();
    }

    if (value instanceof Date) {
      return value;
    }

    return new Date(value);
  }
}

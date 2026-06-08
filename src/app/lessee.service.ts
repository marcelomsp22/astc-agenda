import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  Timestamp,
  addDoc,
  collection,
  collectionData,
  deleteDoc,
  doc,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from '@angular/fire/firestore';
import { User } from 'firebase/auth';
import { Observable, map } from 'rxjs';

import { Lessee, LesseeDocument, LesseeFormValue } from './lessee.model';

@Injectable({
  providedIn: 'root',
})
export class LesseeService {
  private readonly firestore = inject(Firestore);
  private readonly collectionRef = collection(this.firestore, 'lessees');

  watchLessees(): Observable<Lessee[]> {
    return collectionData(query(this.collectionRef, orderBy('name', 'asc')), {
      idField: 'id',
    }).pipe(map((lessees) => lessees.map((lessee) => this.fromDocument(lessee))));
  }

  async createLessee(value: LesseeFormValue, user: User): Promise<void> {
    await addDoc(this.collectionRef, {
      name: value.name.trim(),
      type: value.type,
      createdAt: serverTimestamp(),
      createdByUid: user.uid,
      createdByName: user.displayName || user.email || 'Usuario Google',
    });
  }

  async updateLessee(id: string, value: LesseeFormValue): Promise<void> {
    await updateDoc(doc(this.firestore, 'lessees', id), {
      name: value.name.trim(),
      type: value.type,
      updatedAt: serverTimestamp(),
    });
  }

  async deleteLessee(id: string): Promise<void> {
    await deleteDoc(doc(this.firestore, 'lessees', id));
  }

  private fromDocument(raw: unknown): Lessee {
    const data = raw as LesseeDocument & { id: string };

    return {
      id: data.id,
      name: data.name,
      type: data.type,
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

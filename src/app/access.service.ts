import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  Timestamp,
  collection,
  collectionData,
  doc,
  docData,
  getDoc,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from '@angular/fire/firestore';
import { User } from 'firebase/auth';
import { Observable, map, of } from 'rxjs';

import { UserAccess, UserAccessDocument } from './user-access.model';

@Injectable({
  providedIn: 'root',
})
export class AccessService {
  private readonly firestore = inject(Firestore);
  private readonly collectionRef = collection(this.firestore, 'userAccess');

  async ensureAccessRequest(user: User): Promise<void> {
    const userRef = doc(this.firestore, 'userAccess', user.uid);
    const snapshot = await getDoc(userRef);

    if (snapshot.exists()) {
      return;
    }

    await setDoc(userRef, {
      uid: user.uid,
      email: user.email || '',
      displayName: user.displayName || user.email || 'Usuario Google',
      photoURL: user.photoURL || '',
      status: 'pending',
      createdAt: serverTimestamp(),
    });
  }

  watchUserAccess(uid: string | undefined): Observable<UserAccess | null> {
    if (!uid) {
      return of(null);
    }

    return docData(doc(this.firestore, 'userAccess', uid)).pipe(
      map((value) => (value ? this.fromDocument(value as UserAccessDocument) : null)),
    );
  }

  watchAccessRequests(): Observable<UserAccess[]> {
    return collectionData(query(this.collectionRef, orderBy('createdAt', 'desc'))).pipe(
      map((requests) =>
        requests
          .map((request) => this.fromDocument(request as UserAccessDocument))
          .filter((request) => request.status === 'pending'),
      ),
    );
  }

  async approveUser(request: UserAccess, approver: User): Promise<void> {
    await updateDoc(doc(this.firestore, 'userAccess', request.uid), {
      status: 'approved',
      approvedAt: serverTimestamp(),
      approvedByUid: approver.uid,
      approvedByName: approver.displayName || approver.email || 'Usuario Google',
    });
  }

  private fromDocument(data: UserAccessDocument): UserAccess {
    return {
      uid: data.uid,
      email: data.email,
      displayName: data.displayName,
      photoURL: data.photoURL,
      status: data.status,
      createdAt: this.toDate(data.createdAt),
      approvedAt: data.approvedAt ? this.toDate(data.approvedAt) : undefined,
      approvedByUid: data.approvedByUid,
      approvedByName: data.approvedByName,
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

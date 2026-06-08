import { Timestamp } from '@angular/fire/firestore';

export type AccessStatus = 'pending' | 'approved';

export interface UserAccess {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  status: AccessStatus;
  createdAt: Date;
  approvedAt?: Date;
  approvedByUid?: string;
  approvedByName?: string;
}

export interface UserAccessDocument {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  status: AccessStatus;
  createdAt: Timestamp | Date | string;
  approvedAt?: Timestamp | Date | string;
  approvedByUid?: string;
  approvedByName?: string;
}

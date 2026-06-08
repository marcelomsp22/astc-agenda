import { Timestamp } from '@angular/fire/firestore';

export type LesseeType = 'Associado' | 'Externo';

export interface Lessee {
  id: string;
  name: string;
  type: LesseeType;
  createdAt: Date;
  createdByUid: string;
  createdByName: string;
}

export interface LesseeFormValue {
  name: string;
  type: LesseeType;
}

export interface LesseeDocument {
  name: string;
  type: LesseeType;
  createdAt: Timestamp | Date | string;
  createdByUid: string;
  createdByName: string;
  updatedAt?: Timestamp | Date | string;
}

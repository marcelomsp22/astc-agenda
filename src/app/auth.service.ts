import { Injectable, inject } from '@angular/core';
import { Auth, GoogleAuthProvider, signInWithPopup, signOut, user } from '@angular/fire/auth';

import { AccessService } from './access.service';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly auth = inject(Auth);
  private readonly accessService = inject(AccessService);
  readonly user$ = user(this.auth);

  async signInWithGoogle(): Promise<void> {
    const provider = new GoogleAuthProvider();
    const credential = await signInWithPopup(this.auth, provider);
    await this.accessService.ensureAccessRequest(credential.user);
  }

  async signOut(): Promise<void> {
    await signOut(this.auth);
  }
}

import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig).catch((err) => {
  console.error(err);
  document.body.innerHTML = `<pre style="padding:1rem;color:#c21b12;font-family:monospace;">Erro ao iniciar a aplicação:\n${err?.message ?? err}</pre>`;
});

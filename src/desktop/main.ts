import { mount } from 'svelte';
import '../shared/theme.css';
import App from './App.svelte';

// Контекстное меню WebView в приложении не нужно (кроме полей ввода)
document.addEventListener('contextmenu', (e) => {
  const el = e.target as HTMLElement;
  if (!el.closest('input, textarea, .selectable')) e.preventDefault();
});

// В обычном браузере (npm run dev → /?mock) — фальшивые данные вместо Tauri, чтобы видеть вёрстку
if (import.meta.env.DEV && !('__TAURI_INTERNALS__' in window)) {
  (await import('./mock')).installDesktopMock();
}

mount(App, { target: document.getElementById('app')! });

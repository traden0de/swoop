import { mount } from 'svelte';
import '../shared/theme.css';
import './phone.css';
import '../shared/theme.svelte'; // тема — до первой отрисовки
import App from './App.svelte';

// npm run dev → /phone.html?mock — интерфейс с фальшивыми данными, без сервера
if (import.meta.env.DEV && new URLSearchParams(location.search).has('mock')) {
  (await import('./mock')).installPhoneMock();
}

mount(App, { target: document.getElementById('app')! });

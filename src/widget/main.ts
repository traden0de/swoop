import { mount } from 'svelte';
import '../shared/theme.css';
import App from './App.svelte';

document.addEventListener('contextmenu', (e) => e.preventDefault());
mount(App, { target: document.getElementById('app')! });

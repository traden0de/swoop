// Выбор темы: «Как в системе», светлая или тёмная. Явный выбор ставится атрибутом
// <html data-theme>, а theme.css переопределяет по нему токены. Выбор запоминается в localStorage,
// чтобы первая отрисовка сразу была в нужной теме.

export type ThemePref = 'auto' | 'light' | 'dark';

const STORE = 'swoop.theme';
const mq = matchMedia('(prefers-color-scheme: dark)');

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(STORE);
    return v === 'light' || v === 'dark' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

const state = $state({ pref: readPref() as ThemePref });

export const getThemePref = (): ThemePref => state.pref;

/** Тёмная ли тема сейчас на самом деле — для существа на canvas. */
export function isDarkTheme(): boolean {
  const t = document.documentElement.dataset.theme;
  return t === 'dark' || (t !== 'light' && mq.matches);
}

function apply() {
  const root = document.documentElement;
  if (state.pref === 'auto') delete root.dataset.theme;
  else root.dataset.theme = state.pref;
  // Цвет строки состояния iOS и полосы браузера — под выбранную тему
  const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  metas.forEach((m) => {
    if (!m.dataset.orig) m.dataset.orig = m.content;
    m.content = state.pref === 'auto' ? m.dataset.orig : state.pref === 'dark' ? '#111318' : '#fbf6ef';
  });
}

export function setTheme(pref: ThemePref) {
  state.pref = pref;
  try {
    localStorage.setItem(STORE, pref);
  } catch {
    /* приватный режим */
  }
  apply();
}

apply();

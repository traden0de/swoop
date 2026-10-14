import { getLang, t, type Lang } from './i18n.svelte';

const UNITS = { ru: ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'], en: ['B', 'KB', 'MB', 'GB', 'TB'] };

export function bytes(n: number): string {
  const lang = getLang(), units = UNITS[lang];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  const v = i === 0 ? n : n < 10 ? n.toFixed(1) : Math.round(n);
  return `${String(v).replace('.', lang === 'ru' ? ',' : '.')} ${units[i]}`;
}

export function duration(sec: number): string {
  const lang = getLang();
  if (!isFinite(sec) || sec < 0) return '—';
  if (sec < 60) return lang === 'ru' ? `${Math.ceil(sec)} с` : `${Math.ceil(sec)}s`;
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  if (m < 60) return lang === 'ru' ? `${m} мин ${s} с` : `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return lang === 'ru' ? `${h} ч ${m % 60} мин` : `${h}h ${m % 60}m`;
}

// Форматтеры дорогие — по одному на язык
const fmts = new Map<Lang, { time: Intl.DateTimeFormat; date: Intl.DateTimeFormat }>();
function fmt() {
  const lang = getLang();
  let f = fmts.get(lang);
  if (!f) {
    f = {
      time: new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit' }),
      date: new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short' }),
    };
    fmts.set(lang, f);
  }
  return f;
}

export function when(ms: number): string {
  const d = new Date(ms), now = new Date();
  const diff = (now.getTime() - ms) / 1000;
  if (diff < 45) return t('justNow');
  if (diff < 3600) return t('minAgo', { n: Math.round(diff / 60) });
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((day(now) - day(d)) / 86400000);
  const { time, date } = fmt();
  if (days === 0) return time.format(d);
  if (days === 1) return `${t('yesterday')}, ${time.format(d)}`;
  return `${date.format(d)}, ${time.format(d)}`;
}


export const isLink = (s: string) => /^https?:\/\/\S+$/i.test(s.trim());

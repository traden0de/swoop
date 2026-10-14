// Страница открыта по HTTP, а не HTTPS, поэтому navigator.clipboard в iOS недоступен.
// Остаётся execCommand('copy'): iOS копирует только выделение внутри сфокусированного поля,
// поэтому делаем как clipboard.js — readonly-textarea вне экрана (readonly не даёт вылезти
// клавиатуре), select() + setSelectionRange() и copy прямо в обработчике нажатия.

export function copyText(text: string): boolean {
  if (window.isSecureContext && navigator.clipboard) {
    void navigator.clipboard.writeText(text);
    return true;
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  // 16px — иначе iOS увеличит страницу; позиция у текущей прокрутки, чтобы страница не прыгнула
  ta.style.cssText =
    'position:absolute;left:-9999px;font-size:16px;border:0;padding:0;margin:0;' +
    `top:${window.scrollY || document.documentElement.scrollTop}px;` +
    '-webkit-user-select:text;user-select:text';
  document.body.appendChild(ta);
  const active = document.activeElement as HTMLElement | null;
  ta.select();
  ta.setSelectionRange(0, text.length);
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  ta.remove();
  getSelection()?.removeAllRanges();
  active?.focus?.({ preventScroll: true });
  return ok;
}

/** Запасной путь: выделить текст в элементе, чтобы пользователь скопировал из системного меню. */
export function selectElementText(el: Element) {
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

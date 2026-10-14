// Строки интерфейса. Язык — выбор пользователя («Авто» = язык системы).
// Текущий язык хранится в $state, поэтому t() в разметке перерисовывается при смене языка без перезагрузки.

const ru = {
  // общее
  appName: 'Swoop',
  cancel: 'Отмена',
  retry: 'Повторить',
  remove: 'Убрать',
  copy: 'Копировать',
  copied: 'Скопировано',
  send: 'Отправить',
  open: 'Открыть',
  download: 'Скачать',
  today: 'Сегодня',
  yesterday: 'Вчера',
  justNow: 'только что',
  minAgo: '{n} мин назад',
  fromPc: 'С компьютера',
  // телефон
  pairTitle: 'Привет! Я Swoop',
  pairText: 'Подключи телефон к компьютеру — это займёт пару секунд.',
  step1: 'Открой Swoop на компьютере',
  step2: 'Наведи камеру iPhone на QR-код',
  step3: 'Нажми на появившуюся ссылку',
  pairing: 'Подключаюсь…',
  badToken: 'Этот QR-код устарел. Отсканируй новый в окне Swoop на компьютере.',
  revoked: 'Компьютер отключил это устройство. Отсканируй QR-код ещё раз.',
  connectedTo: 'Подключено к {pc}',
  reconnecting: 'Нет связи с компьютером…',
  tabSend: 'Отправить',
  tabShelf: 'С ПК',
  tabText: 'Текст',
  pickFiles: 'Выбрать файлы',
  pickHint: 'Фото, видео или файлы из «Файлов». Можно сразу много.',
  aboutOriginals: 'Как отправить оригиналы фото',
  originalsHint: 'Чтобы фото пришли в оригинале (HEIC), выбирай их через «Файлы» или в окне выбора нажми «Параметры» → «Текущий».',
  keepAwake: 'Не блокируй экран, пока идёт отправка. Если связь прервётся, передача продолжится с того же места.',
  queued: 'в очереди',
  sending: 'отправка',
  done: 'готово',
  failed: 'ошибка',
  cancelled: 'отменено',
  sentBefore: 'Отправлено раньше',
  nothingSent: 'Здесь появятся отправленные файлы',
  remaining: 'осталось {t}',
  shelfEmpty: 'Перетащи файлы в окно Swoop на компьютере, и они появятся здесь.',
  shelfHintPhotos: 'Фото: открой и удерживай палец на картинке → «Сохранить в Фото». Видео и файлы: кнопка скачивания → «Поделиться» → «Сохранить».',
  textPlaceholder: 'Текст или ссылка для компьютера…',
  textEmpty: 'Отправь текст или ссылку, и на компьютере их можно будет сразу скопировать.',
  settings: 'Настройки',
  deviceName: 'Имя устройства',
  sounds: 'Звуки',
  homeScreen: 'На экран «Домой»',
  homeScreenHint: 'В Safari нажми «Поделиться» → «На экран „Домой“». Swoop откроется без QR-кода.',
  disconnect: 'Отключить это устройство',
  save: 'Сохранить',
  close: 'Закрыть',
  // компьютер
  scanToConnect: 'Отсканируй камерой iPhone',
  sameWifi: 'Телефон и компьютер должны быть в одной сети Wi‑Fi.',
  newQr: 'Новый QR-код',
  newQrConfirm: 'Старый QR-код перестанет работать, все устройства отключатся. Продолжить?',
  publicNetwork: 'Сеть помечена в Windows как «Общедоступная». Брандмауэр может не пустить телефон: переключи сеть на «Частную» в параметрах Wi‑Fi.',
  statusWaiting: 'Жду телефон',
  statusReady: 'Готов принимать',
  statusReceiving: 'Принимаю {n}',
  statusSleeping: 'Дремлю. Разбудит любой файл',
  tabReceived: 'Получено',
  tabDevices: 'Устройства',
  tabSettings: 'Настройки',
  openFolder: 'Открыть папку',
  showInFolder: 'Показать в папке',
  clearHistory: 'Очистить историю',
  clearHistoryConfirm: 'Очистить историю? Сами файлы останутся в папке.',
  receivedEmpty: 'Пока ничего. Выбери файлы на телефоне, и они прилетят сюда.',
  dropHere: 'Перетащи файлы сюда',
  dropHint: 'Они появятся на телефоне во вкладке «С ПК». Файлы не копируются, Swoop отдаёт их с места.',
  addFiles: 'Добавить файлы',
  dropNow: 'Отпускай!',
  textComposer: 'Текст для телефона…',
  autoCopy: 'Сразу копировать текст с телефона',
  devicesEmpty: 'Пока ни одного устройства. Отсканируй QR-код телефоном.',
  online: 'на связи',
  lastSeen: 'был(о) {t}',
  disconnectDevice: 'Отключить',
  saveFolder: 'Папка для файлов',
  change: 'Изменить',
  autostart: 'Запускать вместе с Windows',
  autostartHint: 'Swoop стартует свёрнутым в трей',
  notifications: 'Уведомления о новых файлах',
  widget: 'Виджет на рабочем столе',
  widgetHint: 'Маленький Swoop поверх окон. На него можно бросать файлы',
  soundsDesktop: 'Звуки',
  security: 'Безопасность',
  securityHint: 'Подключиться может только тот, кто отсканировал QR-код.',
  version: 'Версия {v}',
  address: 'Адрес',
  from: 'от {d}',
  files: '{n} файлов',
  language: 'Язык',
  langAuto: 'Как в системе',
  theme: 'Тема',
  themeLight: 'Светлая',
  themeDark: 'Тёмная',
  copyFailed: 'Не получилось скопировать — текст выделен, нажми «Скопировать» в меню',
  preview: 'Просмотр',
};

type Dict = typeof ru;

const en: Dict = {
  appName: 'Swoop',
  cancel: 'Cancel',
  retry: 'Retry',
  remove: 'Remove',
  copy: 'Copy',
  copied: 'Copied',
  send: 'Send',
  open: 'Open',
  download: 'Download',
  today: 'Today',
  yesterday: 'Yesterday',
  justNow: 'just now',
  minAgo: '{n} min ago',
  fromPc: 'From computer',
  pairTitle: "Hi! I'm Swoop",
  pairText: 'Connect your phone to your computer — it takes a couple of seconds.',
  step1: 'Open Swoop on your computer',
  step2: 'Point your iPhone camera at the QR code',
  step3: 'Tap the link that appears',
  pairing: 'Connecting…',
  badToken: 'This QR code has expired. Scan the new one in the Swoop window on your computer.',
  revoked: 'The computer disconnected this device. Scan the QR code again.',
  connectedTo: 'Connected to {pc}',
  reconnecting: 'No connection to the computer…',
  tabSend: 'Send',
  tabShelf: 'From PC',
  tabText: 'Text',
  pickFiles: 'Choose files',
  pickHint: 'Photos, videos or anything from Files. Pick as many as you like.',
  aboutOriginals: 'How to send original photos',
  originalsHint: 'To send photos as originals (HEIC), pick them via Files, or tap Options → Current in the picker.',
  keepAwake: "Keep the screen on while sending. If the connection drops, the transfer picks up where it left off.",
  queued: 'queued',
  sending: 'sending',
  done: 'done',
  failed: 'failed',
  cancelled: 'cancelled',
  sentBefore: 'Sent earlier',
  nothingSent: 'Files you send will show up here',
  remaining: '{t} left',
  shelfEmpty: 'Drop files into the Swoop window on your computer and they will appear here.',
  shelfHintPhotos: 'Photos: open and long-press the picture → Save to Photos. Videos and files: download button → Share → Save.',
  textPlaceholder: 'Text or a link for the computer…',
  textEmpty: 'Send a text or a link and copy it on the computer right away.',
  settings: 'Settings',
  deviceName: 'Device name',
  sounds: 'Sounds',
  homeScreen: 'Add to Home Screen',
  homeScreenHint: 'In Safari tap Share → Add to Home Screen. Swoop will open without the QR code.',
  disconnect: 'Disconnect this device',
  save: 'Save',
  close: 'Close',
  scanToConnect: 'Scan with your iPhone camera',
  sameWifi: 'The phone and the computer must be on the same Wi‑Fi.',
  newQr: 'New QR code',
  newQrConfirm: 'The old QR code will stop working and all devices will be disconnected. Continue?',
  publicNetwork: 'Windows marks this network as Public, so the firewall may block your phone. Switch it to Private in Wi‑Fi settings.',
  statusWaiting: 'Waiting for your phone',
  statusReady: 'Ready to receive',
  statusReceiving: 'Receiving {n}',
  statusSleeping: 'Napping. Any file will wake me up',
  tabReceived: 'Received',
  tabDevices: 'Devices',
  tabSettings: 'Settings',
  openFolder: 'Open folder',
  showInFolder: 'Show in folder',
  clearHistory: 'Clear history',
  clearHistoryConfirm: 'Clear history? The files stay in the folder.',
  receivedEmpty: 'Nothing yet. Pick files on your phone and they will land here.',
  dropHere: 'Drop files here',
  dropHint: 'They will appear on the phone under “From PC”. Files are not copied — Swoop serves them in place.',
  addFiles: 'Add files',
  dropNow: 'Let go!',
  textComposer: 'Text for the phone…',
  autoCopy: 'Copy text from the phone automatically',
  devicesEmpty: 'No devices yet. Scan the QR code with your phone.',
  online: 'online',
  lastSeen: 'seen {t}',
  disconnectDevice: 'Disconnect',
  saveFolder: 'Save files to',
  change: 'Change',
  autostart: 'Start with Windows',
  autostartHint: 'Swoop starts minimized to the tray',
  notifications: 'Notify about new files',
  widget: 'Desktop widget',
  widgetHint: 'A tiny Swoop above your windows. You can drop files on it',
  soundsDesktop: 'Sounds',
  security: 'Security',
  securityHint: 'Only someone who scanned the QR code can connect.',
  version: 'Version {v}',
  address: 'Address',
  from: 'from {d}',
  files: '{n} files',
  language: 'Language',
  langAuto: 'System',
  theme: 'Theme',
  themeLight: 'Light',
  themeDark: 'Dark',
  copyFailed: 'Could not copy — the text is selected, tap Copy in the menu',
  preview: 'Preview',
};

export type Lang = 'ru' | 'en';
export type LangPref = Lang | 'auto';

const STORE = 'swoop.lang';
const systemLang = (): Lang => ((navigator.language || 'en').toLowerCase().startsWith('ru') ? 'ru' : 'en');

function readPref(): LangPref {
  try {
    const v = localStorage.getItem(STORE);
    return v === 'ru' || v === 'en' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

const state = $state({ pref: readPref() as LangPref });
const resolve = (p: LangPref): Lang => (p === 'auto' ? systemLang() : p);

export const getLang = (): Lang => resolve(state.pref);
export const getLangPref = (): LangPref => state.pref;

/** Сменить язык. Выбор запоминается в localStorage, чтобы следующий запуск сразу был на нём. */
export function setLang(pref: LangPref) {
  state.pref = pref;
  try {
    localStorage.setItem(STORE, pref);
  } catch {
    /* приватный режим */
  }
  document.documentElement.lang = getLang();
}
document.documentElement.lang = getLang();

export type Key = keyof Dict;

export function t(key: Key, params: Record<string, string | number> = {}): string {
  const dict = getLang() === 'ru' ? ru : en;
  return dict[key].replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? ''));
}

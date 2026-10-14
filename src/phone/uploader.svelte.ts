// Очередь отправки с докачкой. Файл режется на куски по 8 МБ; при обрыве спрашиваем у сервера,
// сколько байт дошло, и продолжаем оттуда с нарастающей паузой.

import { ApiError, api, putChunk } from './api';
import { makeThumb } from './thumbs';
import type { HistoryItem } from '../shared/types';

const CHUNK = 8 * 1024 * 1024;
const PARALLEL = 2;
const MAX_ATTEMPTS = 15;

export type JobStatus = 'queued' | 'uploading' | 'done' | 'error' | 'cancelled';

export interface Job {
  uid: number;
  file: File;
  name: string;
  size: number;
  mime: string;
  status: JobStatus;
  sent: number;
  id?: string;
  thumb?: string;
  thumbBlob?: Blob | null;
  item?: HistoryItem;
  error?: string;
  retrying?: boolean;
  ctrl?: AbortController;
}

export interface UploaderHooks {
  onStart?: (job: Job) => void;
  onDone?: (job: Job) => void;
  onError?: (job: Job) => void;
  onIdle?: (allOk: boolean) => void;
  onAuthLost?: () => void;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((r) => {
    const t = setTimeout(r, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      r();
    });
  });

let uidSeq = 1;

export class Uploader {
  jobs = $state<Job[]>([]);
  private running = 0;
  private wake: (() => void) | null = null;
  private batchOk = true;

  constructor(private hooks: UploaderHooks = {}) {
    // Сеть вернулась или приложение снова на экране — прерываем паузу перед повтором
    const kick = () => this.wake?.();
    addEventListener('online', kick);
    document.addEventListener('visibilitychange', () => !document.hidden && kick());
  }

  get active() {
    return this.jobs.filter((j) => j.status === 'queued' || j.status === 'uploading');
  }

  /** Байт осталось и сколько уже ушло в текущей пачке — для общего прогресса. */
  get totals() {
    let total = 0, sent = 0;
    for (const j of this.jobs) {
      if (j.status === 'cancelled') continue;
      total += j.size;
      sent += j.status === 'done' ? j.size : j.sent;
    }
    return { total, sent };
  }

  add(files: FileList | File[]) {
    if (this.active.length === 0) {
      // Новая пачка: убираем завершённые строки прошлой
      this.jobs = this.jobs.filter((j) => j.status === 'error');
      this.batchOk = true;
    }
    for (const file of Array.from(files)) {
      const job: Job = {
        uid: uidSeq++,
        file,
        name: file.name || 'file',
        size: file.size,
        mime: file.type,
        status: 'queued',
        sent: 0,
      };
      this.jobs.push(job);
      const live = this.jobs[this.jobs.length - 1];
      makeThumb(file).then((b) => {
        live.thumbBlob = b;
        if (b) live.thumb = URL.createObjectURL(b);
      });
    }
    this.pump();
  }

  retry(job: Job) {
    job.status = 'queued';
    job.error = undefined;
    this.pump();
  }

  async cancel(job: Job) {
    job.status = 'cancelled';
    job.ctrl?.abort();
    if (job.id) await api.cancelUpload(job.id).catch(() => {});
    this.pump();
  }

  clearFinished() {
    this.jobs = this.jobs.filter((j) => j.status === 'queued' || j.status === 'uploading');
  }

  private pump() {
    while (this.running < PARALLEL) {
      const next = this.jobs.find((j) => j.status === 'queued');
      if (!next) break;
      this.running++;
      next.status = 'uploading';
      this.run(next).finally(() => {
        this.running--;
        this.pump();
        if (this.running === 0 && !this.jobs.some((j) => j.status === 'queued')) {
          this.hooks.onIdle?.(this.batchOk);
        }
      });
    }
  }

  private async run(job: Job) {
    const ctrl = new AbortController();
    job.ctrl = ctrl;
    let attempt = 0;
    const fail = (e: unknown) => {
      if (job.status === 'cancelled') return;
      job.status = 'error';
      job.error = e instanceof ApiError ? e.code : 'error';
      this.batchOk = false;
      this.hooks.onError?.(job);
    };

    // 1. Регистрируем загрузку (или находим начатую раньше)
    let offset = 0;
    while (true) {
      try {
        const r = await api.createUpload({
          name: job.name,
          size: job.size,
          mime: job.mime,
          lastModified: job.file.lastModified || 0,
        });
        job.id = r.id;
        offset = r.offset;
        if (r.done && r.item) return this.finish(job, r.item);
        break;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return this.authLost(job);
        if (e instanceof ApiError && e.status > 0) return fail(e);
        if (++attempt > MAX_ATTEMPTS || job.status === 'cancelled') return fail(e);
        await this.pause(attempt, ctrl.signal);
      }
    }

    this.hooks.onStart?.(job);
    job.sent = offset;
    attempt = 0;

    // 2. Куски. Последний «пустой» PUT нужен, если все байты уже на сервере.
    while (job.status === 'uploading') {
      const end = Math.min(job.size, offset + CHUNK);
      try {
        const r = await putChunk(job.id!, offset, job.file.slice(offset, end), (n) => (job.sent = offset + n), ctrl.signal);
        offset = r.offset;
        job.sent = offset;
        attempt = 0;
        job.retrying = false;
        if (r.done) return this.finish(job, r.item!);
      } catch (e) {
        // статус мог смениться, пока шёл запрос (нажали «Отмена»)
        if ((job.status as JobStatus) === 'cancelled') return;
        const err = e as ApiError;
        if (err.status === 401) return this.authLost(job);
        if (err.status === 404) return fail(err); // загрузку удалили на ПК
        if (err.status === 507 || err.status === 413) return fail(err);
        // 409 и обрыв: сервер знает точное смещение
        if (typeof err.body?.offset === 'number') {
          offset = err.body.offset as number;
          job.sent = offset;
          if (err.status === 409) continue;
        }
        if (++attempt > MAX_ATTEMPTS) return fail(err);
        job.retrying = true;
        await this.pause(attempt, ctrl.signal);
        try {
          offset = (await api.uploadStatus(job.id!)).offset;
          job.sent = offset;
        } catch {
          /* ещё нет связи — следующая попытка покажет */
        }
      }
    }
  }

  private pause(attempt: number, signal: AbortSignal) {
    const ms = Math.min(30_000, 800 * 2 ** Math.min(attempt, 6));
    return new Promise<void>((r) => {
      this.wake = r;
      sleep(ms, signal).then(r);
    }).finally(() => (this.wake = null));
  }

  private finish(job: Job, item: HistoryItem) {
    job.status = 'done';
    job.sent = job.size;
    job.item = item;
    job.retrying = false;
    this.hooks.onDone?.(job);
    if (job.thumbBlob) void api.thumb(item.id, job.thumbBlob);
    else makeThumb(job.file).then((b) => b && api.thumb(item.id, b));
  }

  private authLost(job: Job) {
    job.status = 'error';
    job.error = 'unauthorized';
    for (const j of this.jobs) if (j.status === 'queued') j.status = 'error';
    this.hooks.onAuthLost?.();
  }
}

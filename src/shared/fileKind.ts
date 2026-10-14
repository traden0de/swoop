// Тип файла → цвет и глиф плашки. По MIME, а если он пустой или общий — по расширению.

import type { IconName } from './Icon.svelte';

export type FileKind = 'image' | 'video' | 'audio' | 'pdf' | 'doc' | 'sheet' | 'slides' | 'archive' | 'code' | 'file';

const EXT: Record<string, FileKind> = {
  heic: 'image', heif: 'image', jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', webp: 'image', svg: 'image', bmp: 'image', tiff: 'image',
  mov: 'video', mp4: 'video', m4v: 'video', avi: 'video', mkv: 'video', webm: 'video',
  mp3: 'audio', m4a: 'audio', wav: 'audio', aac: 'audio', flac: 'audio', ogg: 'audio', opus: 'audio',
  pdf: 'pdf',
  doc: 'doc', docx: 'doc', odt: 'doc', rtf: 'doc', pages: 'doc', txt: 'doc', md: 'doc',
  xls: 'sheet', xlsx: 'sheet', csv: 'sheet', ods: 'sheet', numbers: 'sheet',
  ppt: 'slides', pptx: 'slides', odp: 'slides', key: 'slides',
  zip: 'archive', rar: 'archive', '7z': 'archive', tar: 'archive', gz: 'archive',
  js: 'code', ts: 'code', json: 'code', html: 'code', css: 'code', py: 'code', rs: 'code', xml: 'code', sh: 'code',
};

export function ext(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toLowerCase() : '';
}

export function fileKind(mime: string, name: string): FileKind {
  const byExt = EXT[ext(name)];
  if (byExt) return byExt;
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf') return 'pdf';
  if (/word|opendocument\.text|rtf/.test(mime)) return 'doc';
  if (/sheet|excel|csv/.test(mime)) return 'sheet';
  if (/presentation|powerpoint/.test(mime)) return 'slides';
  if (/zip|rar|7z|tar|gzip|compressed/.test(mime)) return 'archive';
  if (mime.startsWith('text/')) return 'doc';
  return 'file';
}

export const KIND_STYLE: Record<FileKind, { color: string; icon: IconName }> = {
  image: { color: '#8b5cf6', icon: 'image' },
  video: { color: '#e5487f', icon: 'video' },
  audio: { color: '#f59e0b', icon: 'audio' },
  pdf: { color: '#ef4444', icon: 'doc' },
  doc: { color: '#3b82f6', icon: 'doc' },
  sheet: { color: '#10b981', icon: 'sheet' },
  slides: { color: '#f97316', icon: 'slides' },
  archive: { color: '#a8875a', icon: 'archive' },
  code: { color: '#64748b', icon: 'code' },
  file: { color: '#8a94a6', icon: 'file' },
};

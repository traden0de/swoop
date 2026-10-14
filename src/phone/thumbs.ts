// Превью делаем на телефоне: Safari умеет декодировать HEIC и видео, а Windows без кодеков — нет.

const MAX = 320;

function toJpeg(src: CanvasImageSource, w: number, h: number): Promise<Blob | null> {
  const k = Math.min(1, MAX / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * k));
  c.height = Math.max(1, Math.round(h * k));
  c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
  return new Promise((r) => c.toBlob(r, 'image/jpeg', 0.8));
}

function imageThumb(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = async () => {
      const b = await toJpeg(img, img.naturalWidth, img.naturalHeight);
      URL.revokeObjectURL(url);
      resolve(b);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

function videoThumb(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    const done = (b: Blob | null) => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      v.removeAttribute('src');
      v.load();
      resolve(b);
    };
    const timer = setTimeout(() => done(null), 5000);
    v.muted = true;
    v.playsInline = true;
    v.preload = 'metadata';
    v.onloadeddata = () => {
      v.currentTime = Math.min(0.5, (v.duration || 1) / 3);
    };
    v.onseeked = async () => done(await toJpeg(v, v.videoWidth, v.videoHeight));
    v.onerror = () => done(null);
    v.src = url;
  });
}

// Превью по одному, чтобы не съесть память, если выбрали сотню фото
let chain: Promise<unknown> = Promise.resolve();

export function makeThumb(file: File): Promise<Blob | null> {
  if (file.size > 0 && (file.type.startsWith('image/') || file.type.startsWith('video/'))) {
    const p = chain.then(() => (file.type.startsWith('image/') ? imageThumb(file) : videoThumb(file))).catch(() => null);
    chain = p;
    return p;
  }
  return Promise.resolve(null);
}

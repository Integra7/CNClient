import { getBackendHttpUrl } from '../config';
import { getSessionToken } from '../session';
import type { AttachmentRequest } from '../types';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 МБ
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/quicktime',
  'video/x-msvideo',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'application/zip',
  'application/x-rar-compressed',
];

const ALLOWED_EXTENSIONS = [
  'jpg', 'jpeg', 'png', 'gif', 'webp',
  'mp4', 'mov', 'avi', 'pdf', 'doc', 'docx', 'txt', 'zip', 'rar',
];

export function validateFile(file: File): { valid: boolean; error?: string } {
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: 'Файл слишком большой. Максимальный размер: 20 МБ' };
  }
  const ext = file.name.split('.').pop()?.toLowerCase();
  const typeOk =
    ALLOWED_TYPES.includes(file.type) ||
    (ext != null && ALLOWED_EXTENSIONS.includes(ext)) ||
    file.type.startsWith('image/') ||
    file.type.startsWith('video/');
  if (!typeOk) {
    return { valid: false, error: `Неподдерживаемый тип файла: ${file.type || 'неизвестно'}` };
  }
  return { valid: true };
}

export interface SignatureResponse {
  success: boolean;
  error?: string;
  cloudName?: string;
  apiKey?: string;
  timestamp?: number;
  signature?: string;
  folder?: string;
  publicId?: string;
  maxFileSize?: number;
  allowedFormats?: string[];
  resourceType?: string;
}

export async function getUploadSignature(): Promise<SignatureResponse> {
  const base = getBackendHttpUrl();
  const token = getSessionToken();
  let res: Response;
  try {
    res = await fetch(`${base}/api/upload/signature`, {
      method: 'GET',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    });
  } catch (e) {
    return { success: false, error: 'Нет связи с сервером. Проверьте интернет и что бэкенд запущен.' };
  }
  let data: SignatureResponse;
  try {
    data = (await res.json()) as SignatureResponse;
  } catch {
    return { success: false, error: res.status === 404 ? 'Сервис загрузки не настроен на сервере' : 'Ошибка ответа сервера' };
  }
  if (!res.ok) {
    return { success: false, error: data.error ?? 'Не удалось получить параметры загрузки' };
  }
  if (data.success === false) {
    return { success: false, error: data.error ?? 'Сервис загрузки недоступен' };
  }
  return data;
}

/** Параметры для загрузки голосового сообщения (отдельный эндпоинт) */
export async function getVoiceUploadSignature(): Promise<SignatureResponse> {
  const base = getBackendHttpUrl();
  const token = getSessionToken();
  let res: Response;
  try {
    res = await fetch(`${base}/api/upload/voice-signature`, {
      method: 'GET',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    });
  } catch (e) {
    return { success: false, error: 'Нет связи с сервером. Проверьте интернет и что бэкенд запущен.' };
  }
  let data: SignatureResponse;
  try {
    data = (await res.json()) as SignatureResponse;
  } catch {
    return { success: false, error: res.status === 404 ? 'Сервис загрузки голосовых не настроен' : 'Ошибка ответа сервера' };
  }
  if (!res.ok) {
    return { success: false, error: data.error ?? 'Не удалось получить параметры загрузки' };
  }
  if (data.success === false) {
    return { success: false, error: data.error ?? 'Сервис загрузки голосовых недоступен' };
  }
  return data;
}

const VOICE_MAX_SIZE = 10 * 1024 * 1024; // 10 МБ
const VOICE_MAX_DURATION_SEC = 5 * 60; // 5 минут

export function validateVoiceMessage(blob: Blob, durationSeconds: number): { valid: boolean; error?: string } {
  if (blob.size > VOICE_MAX_SIZE) {
    return { valid: false, error: 'Голосовое сообщение слишком большое. Максимум: 10 МБ' };
  }
  if (durationSeconds > VOICE_MAX_DURATION_SEC) {
    return { valid: false, error: 'Голосовое сообщение слишком длинное. Максимум: 5 минут' };
  }
  return { valid: true };
}

/** Маленькая миниатюра (списки, иконки) */
function buildThumbnailUrl(cloudName: string, publicId: string): string {
  return `https://res.cloudinary.com/${cloudName}/image/upload/w_200,h_200,c_fill,q_auto/${publicId}`;
}

/** Превью для отображения в сообщении: больше размер, лучше качество (в т.ч. Retina) */
export function buildImageDisplayUrl(cloudName: string, publicId: string): string {
  return `https://res.cloudinary.com/${cloudName}/image/upload/w_600,h_600,c_limit,q_auto:good/${publicId}`;
}

const CLOUDINARY_URL_RE = /^https?:\/\/res\.cloudinary\.com\/([^/]+)\//;

/** Достаёт cloud name из URL Cloudinary; для остальных URL возвращает null */
export function getCloudinaryCloudName(url: string): string | null {
  const m = url.match(CLOUDINARY_URL_RE);
  return m?.[1] ?? null;
}

export async function uploadFileToCloudinary(
  file: File,
  onProgress?: (percent: number) => void
): Promise<AttachmentRequest> {
  const sig = await getUploadSignature();
  if (!sig.success || !sig.cloudName || !sig.apiKey || sig.timestamp == null || !sig.signature || !sig.folder || !sig.publicId) {
    throw new Error(sig.error ?? 'Сервис загрузки недоступен');
  }
  const formData = new FormData();
  formData.append('file', file);
  formData.append('api_key', sig.apiKey);
  formData.append('timestamp', String(sig.timestamp));
  formData.append('signature', sig.signature);
  formData.append('folder', sig.folder);
  formData.append('public_id', sig.publicId);

  const url = `https://api.cloudinary.com/v1_1/${sig.cloudName}/auto/upload`;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const result = JSON.parse(xhr.responseText) as {
            public_id: string;
            secure_url: string;
            resource_type: string;
            bytes?: number;
            width?: number;
            height?: number;
            duration?: number;
          };
          const attachment: AttachmentRequest = {
            publicId: result.public_id,
            url: result.secure_url,
            thumbnailUrl: result.resource_type === 'image'
              ? buildThumbnailUrl(sig.cloudName!, result.public_id)
              : result.resource_type === 'video'
                ? `https://res.cloudinary.com/${sig.cloudName}/video/upload/w_200,h_200,c_fill,q_auto/${result.public_id}.jpg`
                : undefined,
            fileName: file.name,
            fileType: file.type,
            fileSize: result.bytes ?? file.size,
            resourceType: result.resource_type,
            width: result.width,
            height: result.height,
            duration: result.duration,
          };
          resolve(attachment);
        } catch {
          reject(new Error('Неверный ответ от сервера загрузки'));
        }
      } else {
        let errMsg = 'Ошибка загрузки';
        try {
          const body = JSON.parse(xhr.responseText) as { error?: { message?: string } };
          errMsg = body?.error?.message ?? errMsg;
        } catch {
          // ignore
        }
        reject(new Error(errMsg));
      }
    };
    xhr.onerror = () => reject(new Error('Ошибка сети'));
    xhr.send(formData);
  });
}

export async function uploadFiles(
  files: File[],
  onProgress?: (fileIndex: number, percent: number) => void
): Promise<AttachmentRequest[]> {
  const results = await Promise.all(
    files.map((file, i) =>
      uploadFileToCloudinary(file, (p) => onProgress?.(i, p))
    )
  );
  return results;
}

/** Загрузка голосового сообщения в Cloudinary (video API). */
export async function uploadVoiceToCloudinary(
  blob: Blob,
  fileName: string,
  onProgress?: (percent: number) => void
): Promise<AttachmentRequest> {
  const sig = await getVoiceUploadSignature();
  if (!sig.success || !sig.cloudName || !sig.apiKey || sig.timestamp == null || !sig.signature || !sig.folder || !sig.publicId) {
    throw new Error(sig.error ?? 'Сервис загрузки голосовых недоступен');
  }
  const formData = new FormData();
  formData.append('file', blob, fileName);
  formData.append('api_key', sig.apiKey);
  formData.append('timestamp', String(sig.timestamp));
  formData.append('signature', sig.signature);
  formData.append('folder', sig.folder);
  formData.append('public_id', sig.publicId);
  formData.append('resource_type', sig.resourceType ?? 'video');

  const url = `https://api.cloudinary.com/v1_1/${sig.cloudName}/video/upload`;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const result = JSON.parse(xhr.responseText) as {
            public_id: string;
            secure_url: string;
            resource_type: string;
            bytes?: number;
            duration?: number;
            format?: string;
          };
          const attachment: AttachmentRequest = {
            publicId: result.public_id,
            url: result.secure_url,
            thumbnailUrl: undefined,
            fileName: fileName,
            fileType: blob.type || `audio/${result.format ?? 'webm'}`,
            fileSize: result.bytes ?? blob.size,
            resourceType: result.resource_type,
            duration: result.duration != null ? Math.round(result.duration) : undefined,
            isVoiceMessage: true,
          };
          resolve(attachment);
        } catch {
          reject(new Error('Неверный ответ от сервера загрузки'));
        }
      } else {
        let errMsg = 'Ошибка загрузки голосового сообщения';
        try {
          const body = JSON.parse(xhr.responseText) as { error?: { message?: string } };
          errMsg = body?.error?.message ?? errMsg;
        } catch {
          // ignore
        }
        reject(new Error(errMsg));
      }
    };
    xhr.onerror = () => reject(new Error('Ошибка сети'));
    xhr.send(formData);
  });
}

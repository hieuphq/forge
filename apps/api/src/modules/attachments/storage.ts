export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_EXPENSE = 5;
export const ALLOWED_ATTACHMENT_TYPES = new Set(["image/jpeg", "image/png", "application/pdf"]);
export type AttachmentStorage = { save(file: File, key: string): Promise<{ key: string }> };
export const memoryAttachmentStorage: AttachmentStorage = { async save(_file, key) { return { key }; } };

const path = require('path');

// A MIME type is supplied by the client and cannot be trusted on its own.
// Every upload must also carry the extension that belongs to that MIME type,
// and stored files get the extension derived from the MIME type - never from
// the original filename.
const IMAGE_TYPES = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
};

const DOCUMENT_TYPES = {
  ...IMAGE_TYPES,
  'application/pdf': ['.pdf'],
};

const STORED_EXTENSION = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

function extensionForMime(mime) {
  return STORED_EXTENSION[String(mime || '').toLowerCase()] || '';
}

function isAllowedUpload(file, allowed) {
  const mime = String(file?.mimetype || '').toLowerCase();
  const extensions = allowed[mime];
  if (!extensions) return false;

  const original = path.basename(String(file?.originalname || '')).toLowerCase();
  return extensions.some((ext) => original.endsWith(ext));
}

module.exports = {
  IMAGE_TYPES,
  DOCUMENT_TYPES,
  extensionForMime,
  isAllowedUpload,
};

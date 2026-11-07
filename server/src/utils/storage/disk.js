const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');
const { extensionForMime } = require('../fileTypes');

const UPLOAD_ROOT = path.join(__dirname, '..', '..', '..', 'uploads');

function resolveKey(key) {
  const full = path.resolve(UPLOAD_ROOT, key);
  if (full !== UPLOAD_ROOT && !full.startsWith(`${UPLOAD_ROOT}${path.sep}`)) {
    throw new Error('Invalid storage key');
  }
  return full;
}

async function save({ buffer, mime, folder }) {
  const ext = extensionForMime(mime) || '.bin';
  const name = `${crypto.randomBytes(16).toString('hex')}${ext}`;
  const key = `${folder}/${name}`;
  const dir = path.join(UPLOAD_ROOT, folder);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(resolveKey(key), buffer);
  return { key, url: `/uploads/${key}` };
}

async function read(key) {
  return fs.readFile(resolveKey(key));
}

async function remove(key) {
  if (!key) return;
  try {
    await fs.unlink(resolveKey(key));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

module.exports = { save, read, remove, UPLOAD_ROOT };

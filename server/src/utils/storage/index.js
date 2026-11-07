const env = require('../../config/env');

// Storage abstraction: save({ buffer, originalName, mime, folder }) -> { url }.
// Drivers: disk (default, local development) and s3 (production).
function getStorage() {
  if (env.storage.driver === 's3') {
    return require('./s3');
  }
  return require('./disk');
}

module.exports = getStorage();

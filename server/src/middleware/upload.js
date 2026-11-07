const multer = require('multer');
const { ApiError } = require('./errorHandler');
const { IMAGE_TYPES, DOCUMENT_TYPES, isAllowedUpload } = require('../utils/fileTypes');

const EXCEL_MIMES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream',
];
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_EXCEL_SIZE = 10 * 1024 * 1024; // 10 MB

function uploader(allowed, label) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_SIZE },
    fileFilter: (req, file, cb) => {
      if (isAllowedUpload(file, allowed)) return cb(null, true);
      return cb(new ApiError(400, `Unsupported ${label} file. Choose ${label === 'image' ? 'JPG, PNG or WebP' : 'JPG, PNG, WebP or PDF'}.`));
    },
  });
}

module.exports = {
  uploadImage: uploader(IMAGE_TYPES, 'image').single('file'),
  uploadDocument: uploader(DOCUMENT_TYPES, 'document').single('file'),
  // Excel uploads use their own size limit and accept the generic binary mime
  // some browsers report for .xlsx files.
  uploadExcel: multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_EXCEL_SIZE },
    fileFilter: (req, file, cb) => {
      const hasExcelName = /\.(xlsx|xls)$/i.test(file.originalname || '');
      if (hasExcelName && (!file.mimetype || EXCEL_MIMES.includes(file.mimetype))) {
        return cb(null, true);
      }
      return cb(new ApiError(400, 'Upload an .xlsx or .xls file'));
    },
  }).single('file'),
};

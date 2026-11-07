const profileService = require('../services/profile.service');

const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

module.exports = {
  getMe: wrap(async (req, res) => {
    res.json(await profileService.loadProfile(req.user.id));
  }),

  updateMe: wrap(async (req, res) => {
    res.json(await profileService.updateOwn(req.user.id, req.body));
  }),

  uploadPicture: wrap(async (req, res) => {
    res.json(await profileService.setPicture(req.user.id, req.file));
  }),

  uploadDocument: wrap(async (req, res) => {
    res.json(await profileService.addDocument(req.user.id, req.file));
  }),

  downloadDocument: wrap(async (req, res) => {
    const { document, buffer } = await profileService.downloadDocument(req.user, req.params.id);
    const fallback = String(document.original_name || 'document')
      .replace(/[^\x20-\x7e]/g, '_')
      .replace(/["\\]/g, '_');

    res.setHeader('Content-Type', document.mime_type);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Length', buffer.length);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(document.original_name)}`
    );
    res.send(buffer);
  }),

  deleteDocument: wrap(async (req, res) => {
    res.json(await profileService.deleteDocument(req.user, req.params.id));
  }),

  list: wrap(async (req, res) => {
    res.json(await profileService.adminList(req.query, { includeSalary: req.user.role === 'admin' }));
  }),

  getOne: wrap(async (req, res) => {
    res.json(
      await profileService.adminGet(req.params.userId, {
        includeSalary: req.user.role === 'admin',
      })
    );
  }),

  updateOne: wrap(async (req, res) => {
    res.json(
      await profileService.adminUpdate(req.params.userId, req.body, {
        allowSalary: req.user.role === 'admin',
      })
    );
  }),

  deleteOne: wrap(async (req, res) => {
    res.json(await profileService.adminDelete(req.user.id, req.params.userId));
  }),
};

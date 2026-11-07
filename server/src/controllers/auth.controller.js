const authService = require('../services/auth.service');
const env = require('../config/env');

const REFRESH_COOKIE = 'hr_refresh';

const cookieOptions = {
  httpOnly: true,
  secure: env.isProd,
  sameSite: env.isProd ? 'strict' : 'lax',
  path: '/api/auth',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

async function login(req, res, next) {
  try {
    const { accessToken, refreshToken, user } = await authService.login(req.body);
    res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions);
    res.json({ accessToken, user });
  } catch (err) {
    next(err);
  }
}

async function refresh(req, res, next) {
  try {
    const { accessToken, refreshToken, user } = await authService.refresh(
      req.cookies[REFRESH_COOKIE]
    );
    res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions);
    res.json({ accessToken, user });
  } catch (err) {
    next(err);
  }
}

async function logout(req, res, next) {
  try {
    await authService.logout(req.user.id, req.cookies[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, { path: cookieOptions.path });
    res.json({ message: 'Signed out' });
  } catch (err) {
    next(err);
  }
}

async function me(req, res, next) {
  try {
    const user = await authService.getMe(req.user.id);
    res.json({ user });
  } catch (err) {
    next(err);
  }
}

async function updateCredentials(req, res, next) {
  try {
    const result = await authService.updateCredentials(req.user.id, req.body);
    res.cookie(REFRESH_COOKIE, result.refreshToken, cookieOptions);
    res.json({ accessToken: result.accessToken, user: result.user });
  } catch (err) {
    next(err);
  }
}

module.exports = { login, refresh, logout, me, updateCredentials };

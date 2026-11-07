const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const env = require('../config/env');

function signAccessToken(user) {
  const userId = user?.id;
  if (!userId) {
    throw new Error('User ID is required to sign access token');
  }
  return jwt.sign(
    { sub: userId.toString(), role: user.role, tokenVersion: Number(user.tokenVersion || 0) },
    env.jwt.accessSecret,
    {
      expiresIn: env.jwt.accessExpires,
    }
  );
}

function signRefreshToken(user) {
  const userId = user?.id;
  if (!userId) {
    throw new Error('User ID is required to sign refresh token');
  }
  return jwt.sign(
    { sub: userId.toString(), type: 'refresh', tokenVersion: Number(user.tokenVersion || 0) },
    env.jwt.refreshSecret,
    { expiresIn: env.jwt.refreshExpires }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.jwt.accessSecret);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, env.jwt.refreshSecret);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function randomToken() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  sha256,
  randomToken,
};

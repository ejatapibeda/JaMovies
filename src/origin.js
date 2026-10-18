const { AsyncLocalStorage } = require("async_hooks");

const current = new AsyncLocalStorage();

function runWithRequest(req, fn) {
  return current.run(req, fn);
}

function originFrom(req) {
  if (process.env.ADDON_URL) return process.env.ADDON_URL.replace(/\/$/, "");
  const headers = (req && req.headers) || {};
  const host = headers["x-forwarded-host"] || headers.host;
  if (!host) return `http://127.0.0.1:${process.env.PORT || 7000}`;
  const proto = String(headers["x-forwarded-proto"] || "http").split(",")[0].trim();
  return `${proto}://${host}`;
}

function publicOrigin(req) {
  return originFrom(req || current.getStore());
}

module.exports = { runWithRequest, publicOrigin };

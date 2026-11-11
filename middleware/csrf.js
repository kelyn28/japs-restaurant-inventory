import { randomBytes, timingSafeEqual } from "crypto";

export function attachCsrfToken(req, res, next) {
  req.session.csrfToken ||= randomBytes(32).toString("hex");
  res.locals.csrfToken = req.session.csrfToken;
  next();
}

export function verifyCsrfToken(req, res, next) {
  const expected = req.session.csrfToken || "";
  const received = String(req.get("X-CSRF-Token") || req.body?._csrf || "");
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  const valid = expectedBuffer.length === receivedBuffer.length
    && expectedBuffer.length > 0
    && timingSafeEqual(expectedBuffer, receivedBuffer);
  if (!valid) {
    return res.status(403).json({ error: "Your session token is invalid or expired. Refresh the page and try again." });
  }
  next();
}

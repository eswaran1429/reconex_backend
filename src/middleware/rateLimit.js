const { rateLimit } = require("express-rate-limit");
const { sendError } = require("../utils/response");

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (req, res) => sendError(res, 429, "Too many login attempts, try again in 15 minutes"),
});

module.exports = {
    loginLimiter,
};

const express = require("express");
const { register, login } = require("./auth.controller");
const { validate } = require("../../middleware/validate");
const { loginLimiter } = require("../../middleware/rateLimit");
const { z } = require("../../utils/schemas");
const router = express.Router();

const registerBody = z.object({
    name: z.string().trim().min(1).max(100),
    email: z.email().max(254),
    password: z.string().min(8).max(72),
});

const loginBody = z.object({
    email: z.email().max(254),
    password: z.string().min(1).max(72),
});

router.post("/register", validate({ body: registerBody }), register);
router.post("/login", loginLimiter, validate({ body: loginBody }), login);

module.exports = router;

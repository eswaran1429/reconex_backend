const router = require("express").Router();
const { getTechnologies } = require("./technology.controller");
const { authMiddleware } = require("../../middleware/auth.middleware");
const { validate } = require("../../middleware/validate");
const { idParam } = require("../../utils/schemas");

const subdomainId = idParam("subdomain");

router.get("/:id", authMiddleware, validate({ params: subdomainId }), getTechnologies);

module.exports = router;

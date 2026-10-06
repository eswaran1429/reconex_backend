const router = require("express").Router();
const { discoverPorts, getPorts } = require("./port.controller");
const { authMiddleware } = require("../../middleware/auth.middleware");
const { validate } = require("../../middleware/validate");
const { idParam } = require("../../utils/schemas");

const subdomainId = idParam("subdomain");

router.get("/discover/:id", authMiddleware, validate({ params: subdomainId }), discoverPorts);

router.get("/get/:id", authMiddleware, validate({ params: subdomainId }), getPorts);

module.exports = router;

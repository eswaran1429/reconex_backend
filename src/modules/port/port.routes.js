const router = require("express").Router();
const { discoverPorts, getPorts } = require("./port.controller");
const { authMiddleware } = require("../../middleware/auth.middleware");

router.get("/discover/:id", authMiddleware, discoverPorts);

router.get("/get/:id", authMiddleware, getPorts);

module.exports = router;

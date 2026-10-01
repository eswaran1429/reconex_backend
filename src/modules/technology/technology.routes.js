const router = require("express").Router();
const { getTechnologies } = require("./technology.controller");
const { authMiddleware } = require("../../middleware/auth.middleware");

router.get("/subdomains/:id/technologies", authMiddleware, getTechnologies);

module.exports = router;

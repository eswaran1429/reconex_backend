const router = require("express").Router();
const {
    discoverSubdomains,
    getSubdomain,
    getSubdomainById
} = require("./subdomain.controller");
const { authMiddleware } = require("../../middleware/auth.middleware");

router.get("/discover/:id", authMiddleware, discoverSubdomains);

router.get("/:id", authMiddleware, getSubdomainById);

module.exports = router;
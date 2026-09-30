const router = require("express").Router();
const {
    discoverSubdomains,
    getSubdomain
} = require("./subdomain.controller");
const { authMiddleware } = require("../../middleware/auth.middleware");

router.get("/discover/:id", authMiddleware, discoverSubdomains);

router.get("/get/:id", authMiddleware, getSubdomain);

module.exports = router;
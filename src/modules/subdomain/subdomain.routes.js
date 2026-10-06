const router = require("express").Router();
const {
    discoverSubdomains,
    getSubdomains,
    getSubdomainById,
    getSSLCertificate
} = require("./subdomain.controller");
const { authMiddleware } = require("../../middleware/auth.middleware");
const { validate } = require("../../middleware/validate");
const { idParam, pagination } = require("../../utils/schemas");

const domainId = idParam("domain");
const subdomainId = idParam("subdomain");

router.get("/discover/:id", authMiddleware, validate({ params: domainId }), discoverSubdomains);

router.get("/list/:id", authMiddleware, validate({ params: domainId, query: pagination }), getSubdomains);

router.get("/ssl/:id", authMiddleware, validate({ params: subdomainId }), getSSLCertificate);

router.get("/:id", authMiddleware, validate({ params: subdomainId }), getSubdomainById);

module.exports = router;

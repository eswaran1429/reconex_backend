const express = require("express");
const { addDomain, getDomains, updateDomain, deleteDomain, getDomain, getDNSRecords, getSecurityHeaders, getExposedResources, getScanHistory, getChanges } = require("./domain.controller");
const { authMiddleware } = require("../../middleware/auth.middleware");
const { validate } = require("../../middleware/validate");
const { z, idParam, httpUrl, pagination } = require("../../utils/schemas");
const router = express.Router();

const domainId = idParam("domain");

const snapshotQuery = pagination.extend({
    type: z.enum(["headers", "exposed_resources"]).optional(),
});

const addBody = z.object({
    name: z.string().trim().min(1).max(100),
    url: httpUrl,
});

const updateBody = z.object({
    name: z.string().trim().min(1).max(100).optional(),
    url: httpUrl.optional(),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
}).refine((data) => Object.keys(data).length > 0, "No data to update");

router.post("/add", authMiddleware, validate({ body: addBody }), addDomain);
router.get("/get", authMiddleware, getDomains);
router.get("/get/:id", authMiddleware, validate({ params: domainId }), getDomain);
router.put("/update/:id", authMiddleware, validate({ params: domainId, body: updateBody }), updateDomain);
router.delete("/delete/:id", authMiddleware, validate({ params: domainId }), deleteDomain);
router.get("/dns/:id", authMiddleware, validate({ params: domainId }), getDNSRecords);
router.get("/security-headers/:id", authMiddleware, validate({ params: domainId }), getSecurityHeaders);
router.get("/exposed-resources/:id", authMiddleware, validate({ params: domainId }), getExposedResources);
router.get("/history/:id", authMiddleware, validate({ params: domainId, query: snapshotQuery }), getScanHistory);
router.get("/changes/:id", authMiddleware, validate({ params: domainId, query: snapshotQuery }), getChanges);

module.exports = router;

const router = require("express").Router();
const { getAlerts } = require("./alert.controller");
const { authMiddleware } = require("../../middleware/auth.middleware");
const { validate } = require("../../middleware/validate");
const { z, prefixedId, pagination, severityList } = require("../../utils/schemas");

const alertQuery = pagination.extend({
    domainId: prefixedId("domain").optional(),
    severity: severityList.optional(),
    type: z.string().trim().min(1).max(50).optional(),
    since: z.coerce.date().optional(),
});

router.get("/get", authMiddleware, validate({ query: alertQuery }), getAlerts);

module.exports = router;

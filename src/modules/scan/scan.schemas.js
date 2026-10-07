const { z, prefixedId, pagination, severityList } = require("../../utils/schemas");
const { STEPS } = require("./scan.service");

const scanListQuery = pagination.extend({
    status: z.enum(["QUEUED", "RUNNING", "COMPLETED", "PARTIAL", "FAILED"]).optional(),
});

const changeQuery = pagination.extend({
    category: z.enum(STEPS).optional(),
    type: z.string().trim().min(1).max(50).optional(),
    severity: severityList.optional(),
    scanId: prefixedId("scan").optional(),
});

module.exports = {
    scanListQuery,
    changeQuery,
};

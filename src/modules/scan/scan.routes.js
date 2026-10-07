const router = require("express").Router();
const { getScan, getScanStatus, getScanChanges } = require("./scan.controller");
const { authMiddleware } = require("../../middleware/auth.middleware");
const { validate } = require("../../middleware/validate");
const { idParam } = require("../../utils/schemas");
const { changeQuery } = require("./scan.schemas");

const scanId = idParam("scan");

router.get("/get/:id", authMiddleware, validate({ params: scanId }), getScan);
router.get("/status/:id", authMiddleware, validate({ params: scanId }), getScanStatus);
router.get("/changes/:id", authMiddleware, validate({ params: scanId, query: changeQuery.omit({ scanId: true }) }), getScanChanges);

module.exports = router;

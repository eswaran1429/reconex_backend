const router = require("express").Router();
const { uploadResults, finishScan, getScan, getScanDevices } = require("./network-scan.controller");
const { authMiddleware } = require("../../middleware/auth.middleware");
const { validate } = require("../../middleware/validate");
const { scanId, resultsBody, completeBody, pagination } = require("./network.schemas");

router.post("/results/:id", authMiddleware, validate({ params: scanId, body: resultsBody }), uploadResults);
router.post("/complete/:id", authMiddleware, validate({ params: scanId, body: completeBody }), finishScan);
router.get("/get/:id", authMiddleware, validate({ params: scanId }), getScan);
router.get("/devices/:id", authMiddleware, validate({ params: scanId, query: pagination }), getScanDevices);

module.exports = router;

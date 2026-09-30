const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../../middleware/auth.middleware");
const { queueScan, allScans, getScan } = require("./scan.controller");

router.post("/queue", authMiddleware, queueScan);
router.get("/all", authMiddleware, allScans);
router.get("/:id", authMiddleware, getScan);

module.exports = router;

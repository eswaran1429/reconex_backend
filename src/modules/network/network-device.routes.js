const router = require("express").Router();
const { getDevice, getDevicePorts, getDeviceHistory } = require("./network-device.controller");
const { authMiddleware } = require("../../middleware/auth.middleware");
const { validate } = require("../../middleware/validate");
const { deviceId, pagination } = require("./network.schemas");

router.get("/get/:id", authMiddleware, validate({ params: deviceId }), getDevice);
router.get("/ports/:id", authMiddleware, validate({ params: deviceId }), getDevicePorts);
router.get("/history/:id", authMiddleware, validate({ params: deviceId, query: pagination }), getDeviceHistory);

module.exports = router;

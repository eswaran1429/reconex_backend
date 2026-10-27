const router = require("express").Router();
const { rateLimit } = require("express-rate-limit");
const {
    addNetwork,
    getNetworks,
    getNetwork,
    updateNetwork,
    deleteNetwork,
    startNetworkScan,
    getNetworkScans,
    getNetworkChanges,
    getNetworkDevices,
    getNetworkDashboard,
} = require("./network.controller");
const { authMiddleware } = require("../../middleware/auth.middleware");
const { validate } = require("../../middleware/validate");
const { sendError } = require("../../utils/response");
const { networkId, addBody, updateBody, scanListQuery, changeQuery, deviceListQuery } = require("./network.schemas");

// Per user, after authMiddleware has set req.user.
const scanLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    keyGenerator: (req) => req.user.id,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (req, res) => sendError(res, 429, "Too many network scans, try again later"),
});

router.post("/add", authMiddleware, validate({ body: addBody }), addNetwork);
router.get("/get", authMiddleware, getNetworks);
router.get("/get/:id", authMiddleware, validate({ params: networkId }), getNetwork);
router.put("/update/:id", authMiddleware, validate({ params: networkId, body: updateBody }), updateNetwork);
router.delete("/delete/:id", authMiddleware, validate({ params: networkId }), deleteNetwork);
router.post("/scan/:id", authMiddleware, scanLimiter, validate({ params: networkId }), startNetworkScan);
router.get("/scans/:id", authMiddleware, validate({ params: networkId, query: scanListQuery }), getNetworkScans);
router.get("/changes/:id", authMiddleware, validate({ params: networkId, query: changeQuery }), getNetworkChanges);
router.get("/devices/:id", authMiddleware, validate({ params: networkId, query: deviceListQuery }), getNetworkDevices);
router.get("/dashboard/:id", authMiddleware, validate({ params: networkId }), getNetworkDashboard);

module.exports = router;

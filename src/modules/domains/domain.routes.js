const express = require("express");
const { addDomain, getDomains, updateDomain, deleteDomain, getDomain, getDNSRecords, getSSLCertificates } = require("./domain.controller");
const { authMiddleware } = require("../../middleware/auth.middleware");
const router = express.Router();

router.post("/add", authMiddleware, addDomain);
router.get("/get", authMiddleware, getDomains);
router.get("/get/:id", authMiddleware, getDomain);
router.put("/update/:id", authMiddleware, updateDomain);
router.delete("/delete/:id", authMiddleware, deleteDomain);
router.get("/dns/:id", authMiddleware, getDNSRecords);
router.get("/ssl/:id", authMiddleware, getSSLCertificates);




module.exports = router;
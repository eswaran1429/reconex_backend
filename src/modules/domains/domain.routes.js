const express = require("express");
const { addDomain, getDomains, updateDomain, deleteDomain, getDomain } = require("./domain.controller");
const { authMiddleware } = require("../../middleware/auth.middleware");
const router = express.Router();

router.post("/add", authMiddleware, addDomain);
router.get("/get", authMiddleware, getDomains);
router.get("/get/:id", authMiddleware, getDomain);
router.put("/update/:id", authMiddleware, updateDomain);
router.delete("/delete/:id", authMiddleware, deleteDomain);



module.exports = router;
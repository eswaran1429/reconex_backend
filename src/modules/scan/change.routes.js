const router = require("express").Router();
const { getChange } = require("./scan.controller");
const { authMiddleware } = require("../../middleware/auth.middleware");
const { validate } = require("../../middleware/validate");
const { idParam } = require("../../utils/schemas");

router.get("/get/:id", authMiddleware, validate({ params: idParam("change") }), getChange);

module.exports = router;

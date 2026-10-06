const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
const authRoutes = require("./modules/auth/auth.routes");
const domainRoutes = require("./modules/domains/domain.routes");
const subdomainRoutes = require("./modules/subdomain/subdomain.routes");
const portRoutes = require("./modules/port/port.routes");
const technologyRoutes = require("./modules/technology/technology.routes");
const { sendSuccess, sendError, serverError } = require("./utils/response");

app.use(cors());
app.use(express.json());

app.use("/auth", authRoutes);
app.use("/domain", domainRoutes);
app.use("/subdomain", subdomainRoutes);
app.use("/port", portRoutes);
app.use("/technology", technologyRoutes);

app.get("/", (req, res) => {
    sendSuccess(res, 200, "API is running");
});

app.use((req, res) => {
    sendError(res, 404, `Route not found: ${req.method} ${req.originalUrl}`);
});

app.use((error, req, res, next) => {
    if (error.type === "entity.parse.failed") {
        return sendError(res, 400, "Invalid JSON body");
    }
    return serverError(res, error);
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
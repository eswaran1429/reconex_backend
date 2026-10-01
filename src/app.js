const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
const authRoutes = require("./modules/auth/auth.routes");
const domainRoutes = require("./modules/domains/domain.routes");
const scanRoutes = require("./modules/scans/scan.routes");
const subdomainRoutes = require("./modules/subdomain/subdomain.routes");
const portRoutes = require("./modules/port/port.routes");
const technologyRoutes = require("./modules/technology/technology.routes");

app.use(cors());
app.use(express.json());

app.use("/auth", authRoutes);
app.use("/domain", domainRoutes);
app.use("/scan", scanRoutes);
app.use("/subdomain", subdomainRoutes);
app.use("/port", portRoutes);
app.use("/", technologyRoutes);

app.get("/", (req, res) => {
    res.json({ message: "API is runningsss" });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
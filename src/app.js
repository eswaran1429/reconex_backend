const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
const authRoutes = require("./routes/auth.routes");
const domainRoutes = require("./routes/domain.routes");

app.use(cors());
app.use(express.json());

app.use("/auth", authRoutes);
app.use("/domain", domainRoutes);

app.get("/", (req, res) => {
    res.json({ message: "API is runningsss" });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
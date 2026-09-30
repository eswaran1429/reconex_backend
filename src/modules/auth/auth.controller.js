const prisma = require("../../config/prisma");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const JWT_SECRET = process.env.JWT_SECRET;

const register = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        const user = await prisma.user.findUnique({
            where: { email: email }
        });
        if (user) {
            return res.status(400).json({ message: "User already exists" });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const token = jwt.sign({ email, password }, JWT_SECRET, { expiresIn: "3d" });
        const newUser = await prisma.user.create({
            data: { name, email, password: hashedPassword, token }
        });
        return res.status(200).json({ message: "User registered successfully", user: newUser });
    } catch (error) {
        return res.status(500).json({ message: "Internal server error", error: error.message });
    }

}

const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await prisma.user.findUnique({
            where: { email: email }
        });
        if (!user) {
            return res.status(400).json({ message: "User not found" });
        }
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(400).json({ message: "Invalid password" });
        }
        const token = jwt.sign({ email, password }, JWT_SECRET, { expiresIn: "3d" });
        const updatedUser = await prisma.user.update({
            where: { email: email },
            data: { token }
        });
        return res.status(200).json({ message: "User logged in successfully", user: updatedUser });
    } catch (error) {
        return res.status(500).json({ message: "Internal server error", error: error.message });
    }

}


module.exports = {
    register,
    login,
}
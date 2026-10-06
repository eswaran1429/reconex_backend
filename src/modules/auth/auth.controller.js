const prisma = require("../../config/prisma");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { sendSuccess, sendError, serverError } = require("../../utils/response");

const JWT_SECRET = process.env.JWT_SECRET;

const toPublicUser = (user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    token: user.token,
    createdAt: user.createdAt,
});

const signToken = (user) => jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: "3d" });

const register = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        const user = await prisma.user.findUnique({
            where: { email: email }
        });
        if (user) {
            return sendError(res, 400, "User already exists");
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await prisma.user.create({
            data: { name, email, password: hashedPassword, token: "" }
        });
        const updatedUser = await prisma.user.update({
            where: { id: newUser.id },
            data: { token: signToken(newUser) }
        });
        return sendSuccess(res, 200, "User registered successfully", toPublicUser(updatedUser));
    } catch (error) {
        return serverError(res, error);
    }

}

const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await prisma.user.findUnique({
            where: { email: email }
        });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return sendError(res, 400, "Invalid email or password");
        }
        const updatedUser = await prisma.user.update({
            where: { id: user.id },
            data: { token: signToken(user) }
        });
        return sendSuccess(res, 200, "User logged in successfully", toPublicUser(updatedUser));
    } catch (error) {
        return serverError(res, error);
    }

}


module.exports = {
    register,
    login,
}

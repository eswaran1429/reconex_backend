const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");

const authMiddleware = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                success: false,
                message: "Authorization token missing",
            });
        }

        const token = authHeader.split(" ")[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const user = await prisma.user.findUnique({
            where: {
                email: decoded.email
            },
            select: {
                id: true,
                name: true,
                email: true,
                token: true,
            }
        });

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "User not found",
            });
        }

        if (!user.token || user.token !== token) {
            return res.status(401).json({
                success: false,
                message: "Token revoked, please log in again",
            });
        }

        const { token: _, ...safeUser } = user;
        req.user = safeUser;
        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: "Unauthorized",
            error: error.message
        });
    }
}

module.exports = {
    authMiddleware,
};

const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");
const { sendError } = require("../utils/response");

const authMiddleware = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return sendError(res, 401, "Authorization token missing");
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
            return sendError(res, 401, "User not found");
        }

        if (!user.token || user.token !== token) {
            return sendError(res, 401, "Token revoked, please log in again");
        }

        const { token: _, ...safeUser } = user;
        req.user = safeUser;
        next();
    } catch (error) {
        return sendError(res, 401, "Unauthorized", error);
    }
}

module.exports = {
    authMiddleware,
};

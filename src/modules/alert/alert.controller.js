const prisma = require("../../config/prisma");
const { sendSuccess, serverError } = require("../../utils/response");

const getAlerts = async (req, res) => {
    try {
        const { domainId, severity, type, since, page, limit } = req.validated.query;
        const where = {
            domain: {
                userId: req.user.id,
            },
        };
        if (domainId) where.domainId = domainId;
        if (severity) where.severity = { in: severity };
        if (type) where.type = type;
        if (since) where.createdAt = { gte: since };

        const [items, total] = await prisma.$transaction([
            prisma.alert.findMany({
                where,
                include: {
                    domain: {
                        select: {
                            name: true,
                        },
                    },
                },
                orderBy: {
                    createdAt: "desc",
                },
                skip: (page - 1) * limit,
                take: limit,
            }),
            prisma.alert.count({ where }),
        ]);

        return sendSuccess(res, 200, "Alerts fetched successfully", {
            items: items.map(({ domain, ...alert }) => ({ ...alert, domainName: domain.name })),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        return serverError(res, error);
    }
}

module.exports = {
    getAlerts,
};

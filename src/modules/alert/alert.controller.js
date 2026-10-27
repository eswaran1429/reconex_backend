const prisma = require("../../config/prisma");
const { sendSuccess, serverError } = require("../../utils/response");

const getAlerts = async (req, res) => {
    try {
        const { domainId, networkId, severity, type, since, page, limit } = req.validated.query;
        // An alert belongs to a domain or a network; both are owned through userId.
        const where = {
            OR: [
                { domain: { userId: req.user.id } },
                { network: { userId: req.user.id } },
            ],
        };
        if (domainId) where.domainId = domainId;
        if (networkId) where.networkId = networkId;
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
                    network: {
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
            items: items.map(({ domain, network, ...alert }) => ({
                ...alert,
                domainName: domain?.name ?? null,
                networkName: network?.name ?? null,
            })),
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

const prisma = require("../../config/prisma");
const { sendSuccess, sendError, serverError } = require("../../utils/response");
const { SEVERITY_ORDER, assessSubdomain } = require("./graph.risk");

const getDomainGraph = async (req, res) => {
    try {
        const domain = await prisma.domain.findUnique({
            where: {
                id: req.params.id,
                userId: req.user.id,
            },
            select: {
                id: true,
                name: true,
                url: true,
                status: true,
                createdAt: true,
                updatedAt: true,
            },
        });
        if (!domain) {
            return sendError(res, 404, "Domain not found");
        }

        const rows = await prisma.subdomain.findMany({
            where: {
                domainId: domain.id,
            },
            orderBy: {
                hostname: "asc",
            },
            select: {
                id: true,
                hostname: true,
                ipAddress: true,
                status: true,
                lastSeenAt: true,
                ports: {
                    select: { port: true, protocol: true, service: true, state: true, lastSeenAt: true },
                    orderBy: { port: "asc" },
                },
                sslCertificates: {
                    select: { valid: true, expiresAt: true, issuer: true, tlsVersion: true, updatedAt: true },
                    take: 1,
                },
                technologies: {
                    select: {
                        version: true,
                        technology: {
                            select: { name: true, category: true },
                        },
                    },
                },
            },
        });

        const now = new Date();
        const summary = Object.fromEntries(SEVERITY_ORDER.map((severity) => [severity, 0]));

        const subdomains = rows.map(({ sslCertificates, technologies, ...subdomain }) => {
            const ssl = sslCertificates[0] || null;
            const techs = technologies.map(({ version, technology }) => ({
                name: technology.name,
                version,
                category: technology.category,
            }));
            const { severity, findings } = assessSubdomain({ ports: subdomain.ports, ssl, technologies: techs }, now);
            if (severity) summary[severity] += 1;

            return {
                ...subdomain,
                ssl,
                technologies: techs,
                severity,
                findings,
            };
        });

        return sendSuccess(res, 200, "Domain graph fetched successfully", {
            domain,
            summary: {
                subdomains: subdomains.length,
                bySeverity: summary,
            },
            subdomains,
        });
    } catch (error) {
        return serverError(res, error);
    }
}

module.exports = {
    getDomainGraph,
};

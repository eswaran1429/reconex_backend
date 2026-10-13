const prisma = require("../../config/prisma");
const { sendSuccess, sendError, serverError } = require("../../utils/response");
const { ScanError } = require("../../utils/errors");
const { scanTechnologies } = require("./technology.scanner");

const syncTechnologies = async (subdomain) => {
    let detected;
    try {
        detected = await scanTechnologies(subdomain.hostname);
    } catch (error) {
        throw new ScanError(`Could not reach ${subdomain.hostname}`, error);
    }

    for (const { name, category, version } of detected) {
        const technology = await prisma.technology.upsert({
            where: {
                name: name,
            },
            update: {},
            create: {
                name: name,
                category: category,
            },
        });

        await prisma.subdomainTechnology.upsert({
            where: {
                subdomainId_technologyId: {
                    subdomainId: subdomain.id,
                    technologyId: technology.id,
                },
            },
            update: {
                version: version || undefined,
            },
            create: {
                subdomainId: subdomain.id,
                technologyId: technology.id,
                version: version,
            },
        });
    }

    return detected;
}

const getTechnologies = async (req, res) => {
    try {
        const userId = req.user.id;
        const subdomainId = req.params.id;
        const subdomain = await prisma.subdomain.findFirst({
            where: {
                id: subdomainId,
                domain: {
                    userId: userId,
                },
            },
        });
        if (!subdomain) {
            return sendError(res, 404, "Subdomain not found");
        }

        await syncTechnologies(subdomain);

        const technologies = await prisma.subdomainTechnology.findMany({
            where: {
                subdomainId: subdomain.id,
            },
            include: {
                technology: true,
            },
            orderBy: {
                createdAt: "asc",
            },
        });

        return sendSuccess(res, 200, "Technologies fetched successfully", technologies.map((entry) => ({
                id: entry.id,
                technologyId: entry.technologyId,
                name: entry.technology.name,
                category: entry.technology.category,
                version: entry.version,
                createdAt: entry.createdAt,
                updatedAt: entry.updatedAt,
            })));
    } catch (error) {
        if (error instanceof ScanError) {
            return sendError(res, 502, error.message, error.cause);
        }
        return serverError(res, error);
    }
}

const getDomainTechnologies = async (req, res) => {
    try {
        const domain = await prisma.domain.findUnique({
            where: {
                id: req.params.id,
                userId: req.user.id,
            },
        });
        if (!domain) {
            return sendError(res, 404, "Domain not found");
        }

        const links = await prisma.subdomainTechnology.findMany({
            where: {
                subdomain: { domainId: domain.id },
            },
            include: {
                technology: true,
                subdomain: {
                    select: { id: true, hostname: true },
                },
            },
            orderBy: {
                subdomain: { hostname: "asc" },
            },
        });

        const grouped = new Map();
        for (const link of links) {
            const { technology, subdomain } = link;
            if (!grouped.has(technology.id)) {
                grouped.set(technology.id, {
                    technologyId: technology.id,
                    name: technology.name,
                    category: technology.category,
                    subdomainCount: 0,
                    subdomains: [],
                });
            }
            const entry = grouped.get(technology.id);
            entry.subdomainCount += 1;
            entry.subdomains.push({
                subdomainId: subdomain.id,
                hostname: subdomain.hostname,
                version: link.version,
            });
        }

        const technologies = [...grouped.values()]
            .sort((a, b) => b.subdomainCount - a.subdomainCount || a.name.localeCompare(b.name));

        return sendSuccess(res, 200, "Domain technologies fetched successfully", technologies);
    } catch (error) {
        return serverError(res, error);
    }
}

module.exports = {
    getTechnologies,
    syncTechnologies,
    getDomainTechnologies,
};

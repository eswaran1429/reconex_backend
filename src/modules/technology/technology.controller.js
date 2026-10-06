const prisma = require("../../config/prisma");
const { sendSuccess, sendError, serverError } = require("../../utils/response");
const { scanTechnologies } = require("./technology.scanner");

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

        let detected;
        try {
            detected = await scanTechnologies(subdomain.hostname);
        } catch (error) {
            return sendError(res, 502, `Could not reach ${subdomain.hostname}`, error);
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
        return serverError(res, error);
    }
}

module.exports = {
    getTechnologies,
};

const prisma = require("../../config/prisma");
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
            return res.status(404).json({
                success: false,
                message: "Subdomain not found",
            });
        }

        let detected;
        try {
            detected = await scanTechnologies(subdomain.hostname);
        } catch (error) {
            return res.status(502).json({
                success: false,
                message: `Could not reach ${subdomain.hostname}`,
                error: error.message,
            });
        }

        for (const { name, category, version } of detected) {
            // One Technology row per name, shared by all subdomains.
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

            // One link per subdomain + technology; keep the old version if none was detected this time.
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

        return res.status(200).json({
            success: true,
            message: "Technologies fetched successfully",
            data: technologies.map((entry) => ({
                id: entry.id,
                technologyId: entry.technologyId,
                name: entry.technology.name,
                category: entry.technology.category,
                version: entry.version,
                createdAt: entry.createdAt,
                updatedAt: entry.updatedAt,
            })),
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
}

module.exports = {
    getTechnologies,
};

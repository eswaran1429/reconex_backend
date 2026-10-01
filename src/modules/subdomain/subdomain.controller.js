const dns = require("../../config/dns");
const prisma = require("../../config/prisma");

const commonSubdomains = [
    "www",
    "api",
    "admin",
    "app",
    "dev",
    "staging",
    "test",
    "mail",
    "cdn",
];

const discoverSubdomains = async (req, res) => {
    try {
        const { id } = req.params;
        const domain = await prisma.domain.findUnique({
            where: {
                id: id,
            },
        });

        if (!domain) {
            return res.status(404).json({
                success: false,
                message: "Domain not found",
            });
        }

        // "https://orangetaxi.fleto.in" -> "orangetaxi.fleto.in"
        const rootHostname = new URL(domain.url).hostname;

        const result = [];

        for (const prefix of commonSubdomains) {
            const hostname = `${prefix}.${rootHostname}`;

            try {
                const addresses = await dns.resolve4(hostname);

                const ipAddress = addresses[0] || null;

                const subdomain = await prisma.subdomain.upsert({
                    where: {
                        domainId_hostname: {
                            domainId: domain.id,
                            hostname,
                        },
                    },
                    update: {
                        ipAddress,
                        status: "ACTIVE",
                        lastSeenAt: new Date(),
                    },
                    create: {
                        domainId: domain.id,
                        hostname,
                        ipAddress,
                        status: "ACTIVE",
                    },
                });

                result.push(subdomain);
            } catch (error) {
                // DNS resolution failed, so this hostname is ignored
            }
        }

        return res.status(200).json({
            success: true,
            data: result,
        });
    } catch (error) {
        console.error("Subdomain discovery error:", error);

        return res.status(500).json({
            success: false,
            message: error.message || "Failed to discover subdomains",
        });
    }
};

// const getSubdomain = async (req, res) => {
//     try {
//         const id = req.params.id;
//         const result = await prisma.subdomain.findMany({
//             where: {
//                 domainId: id,
//             },
//         });

//         return res.status(200).json({
//             success: true,
//             data: result,
//         });
//     } catch (error) {
//         console.error("Subdomain discovery error:", error);

//         return res.status(500).json({
//             success: false,
//             message: error.message || "Failed to discover subdomains",
//         });
//     }
// }

const getSubdomainById = async (req, res) => {
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

        return res.status(200).json({
            success: true,
            data: subdomain,
        });
    } catch (error) {
        console.error("Subdomain fetch error:", error);

        return res.status(500).json({
            success: false,
            message: error.message || "Failed to fetch subdomain",
        });
    }
}

module.exports = {
    discoverSubdomains,
    getSubdomainById
};
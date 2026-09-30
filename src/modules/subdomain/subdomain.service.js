const dns = require("dns").promises;
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

const discoverSubdomains = async (domainId) => {
    const domain = await prisma.domain.findUnique({
        where: {
            id: domainId,
        },
    });

    if (!domain) {
        throw new Error("Domain not found");
    }

    // "https://orangetaxi.fleto.in" -> "orangetaxi.fleto.in"
    const rootHostname = new URL(domain.url).hostname;

    const results = [];

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

            results.push(subdomain);
        } catch (error) {
            // DNS resolution failed, so this hostname is ignored
        }
    }

    return results;
};

module.exports = {
    discoverSubdomains,
};
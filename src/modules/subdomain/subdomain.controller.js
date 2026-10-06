const tls = require("tls");
const dns = require("../../config/dns");
const prisma = require("../../config/prisma");
const { sendSuccess, sendError, serverError } = require("../../utils/response");

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

const findUserSubdomain = (subdomainId, userId) => {
    return prisma.subdomain.findFirst({
        where: {
            id: subdomainId,
            domain: {
                userId: userId,
            },
        },
    });
}

const discoverSubdomains = async (req, res) => {
    try {
        const { id } = req.params;
        const domain = await prisma.domain.findUnique({
            where: {
                id: id,
                userId: req.user.id,
            },
        });

        if (!domain) {
            return sendError(res, 404, "Domain not found");
        }

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
                if (!["ENOTFOUND", "ENODATA"].includes(error.code)) throw error;
            }
        }

        return sendSuccess(res, 200, "Subdomains discovered successfully", result);
    } catch (error) {
        return serverError(res, error);
    }
};

const getSubdomains = async (req, res) => {
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

        const { page, limit } = req.validated.query;
        const where = { domainId: domain.id };
        const [items, total] = await prisma.$transaction([
            prisma.subdomain.findMany({
                where,
                orderBy: {
                    hostname: "asc",
                },
                skip: (page - 1) * limit,
                take: limit,
            }),
            prisma.subdomain.count({ where }),
        ]);

        return sendSuccess(res, 200, "Subdomains fetched successfully", {
            items,
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

const getSubdomainById = async (req, res) => {
    try {
        const subdomain = await findUserSubdomain(req.params.id, req.user.id);
        if (!subdomain) {
            return sendError(res, 404, "Subdomain not found");
        }

        return sendSuccess(res, 200, "Subdomain fetched successfully", subdomain);
    } catch (error) {
        return serverError(res, error);
    }
}

const lookupSSLCertificate = (hostname) => {
    return new Promise((resolve, reject) => {
        const socket = tls.connect({ host: hostname, port: 443, servername: hostname, rejectUnauthorized: false }, () => {
            const cert = socket.getPeerCertificate();
            const protocol = socket.getProtocol();
            const authorized = socket.authorized;
            const authorizationError = socket.authorizationError ? String(socket.authorizationError) : null;
            socket.destroy();
            resolve({ cert, protocol, authorized, authorizationError });
        });
        socket.setTimeout(10000, () => {
            socket.destroy(new Error(`SSL connection to ${hostname} timed out`));
        });
        socket.on("error", (err) => {
            reject(err);
        });
    });
}

const getSSLCertificate = async (req, res) => {
    try {
        const subdomain = await findUserSubdomain(req.params.id, req.user.id);
        if (!subdomain) {
            return sendError(res, 404, "Subdomain not found");
        }

        let result;
        try {
            result = await lookupSSLCertificate(subdomain.hostname);
        } catch (error) {
            return sendError(res, 502, `Could not connect to ${subdomain.hostname}:443`, error);
        }

        const { cert, protocol, authorized, authorizationError } = result;
        if (!cert || Object.keys(cert).length === 0) {
            return sendError(res, 502, `${subdomain.hostname} did not present a certificate`);
        }

        const data = {
            issuer: cert.issuer?.O || cert.issuer?.CN || null,
            subject: cert.subject?.CN || null,
            validFrom: cert.valid_from ? new Date(cert.valid_from) : null,
            expiresAt: cert.valid_to ? new Date(cert.valid_to) : null,
            tlsVersion: protocol,
            fingerprint: cert.fingerprint256 || null,
            valid: authorized,
            validationError: authorizationError,
        };

        const certificate = await prisma.sslCertificate.upsert({
            where: {
                subdomainId: subdomain.id,
            },
            update: data,
            create: {
                ...data,
                subdomainId: subdomain.id,
            },
        });

        return sendSuccess(res, 200, "SSL certificate fetched successfully", certificate);
    } catch (error) {
        return serverError(res, error);
    }
}

module.exports = {
    discoverSubdomains,
    getSubdomains,
    getSubdomainById,
    getSSLCertificate
};

const dns = require("../../config/dns");
const tls = require("tls");
const crypto = require("crypto");
const prisma = require("../../config/prisma");

const addDomain = async (req, res) => {
    try {
        const { name, url } = req.body;
        const userId = req.user.id;
        await prisma.domain.create({
            data: {
                userId: userId,
                name: name,
                url: url,
            },
        });
        return res.status(200).json({
            success: true,
            message: "Domain added successfully",
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};

const getDomains = async (req, res) => {
    try {
        const userId = req.user.id;
        const domains = await prisma.domain.findMany({
            where: {
                userId: userId,
            },
        });
        return res.status(200).json({
            success: true,
            message: "Domains fetched successfully",
            data: domains,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
}

const getDomain = async (req, res) => {
    try {
        const userId = req.user.id;
        const domainId = req.params.id;
        const domain = await prisma.domain.findUnique({
            where: {
                userId: userId,
                id: domainId,
            },
        });
        if (!domain) {
            return res.status(404).json({
                success: false,
                message: "Domain not found",
            });
        }
        return res.status(200).json({
            success: true,
            message: "Domains fetched successfully",
            data: domain,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
}

const updateDomain = async (req, res) => {
    try {
        const userId = req.user.id;
        const domainId = req.params.id;
        const { name, status, url } = req.body;
        const data = {}
        if (name != null && name != undefined) data.name = name;
        if (status != null && status != undefined) data.status = status;
        if (url != null && url != undefined) data.url = url;

        if (Object.keys(data).length == 0) {
            return res.status(400).json({
                success: false,
                message: "No data to update",
            });
        }
        await prisma.domain.update({
            where: {
                userId: userId,
                id: domainId,
            },
            data: data
        });
        return res.status(200).json({
            success: true,
            message: "Domain updated successfully",
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
}

const deleteDomain = async (req, res) => {
    try {
        const userId = req.user.id;
        const domainId = req.params.id;
        await prisma.domain.delete({
            where: {
                userId: userId,
                id: domainId,
            },
        });
        return res.status(200).json({
            success: true,
            message: "Domain deleted successfully",
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
}

const lookupDNSRecords = async (hostname) => {
    const lookups = {
        A: async () => (await dns.resolve4(hostname, { ttl: true }))
            .map((r) => ({ value: r.address, ttl: r.ttl })),
        AAAA: async () => (await dns.resolve6(hostname, { ttl: true }))
            .map((r) => ({ value: r.address, ttl: r.ttl })),
        CNAME: async () => (await dns.resolveCname(hostname))
            .map((value) => ({ value, ttl: null })),
        MX: async () => (await dns.resolveMx(hostname))
            .map((r) => ({ value: `${r.priority} ${r.exchange}`, ttl: null })),
        NS: async () => (await dns.resolveNs(hostname))
            .map((value) => ({ value, ttl: null })),
        TXT: async () => (await dns.resolveTxt(hostname))
            .map((chunks) => ({ value: chunks.join(""), ttl: null })),
        SOA: async () => {
            const soa = await dns.resolveSoa(hostname);
            return [{
                value: `${soa.nsname} ${soa.hostmaster} ${soa.serial} ${soa.refresh} ${soa.retry} ${soa.expire} ${soa.minttl}`,
                ttl: null,
            }];
        },
    };

    const records = [];
    for (const [type, lookup] of Object.entries(lookups)) {
        try {
            const results = await lookup();
            for (const { value, ttl } of results) {
                records.push({ type, name: hostname, value, ttl });
            }
        } catch (error) {
            // No record of this type (ENODATA / ENOTFOUND), skip it
        }
    }
    return records;
}


const lookupSSLCertificate = async (hostname) => {
    return new Promise((resolve, reject) => {
        const socket = tls.connect({ host: hostname, port: 443, servername: hostname }, () => {
            const cert = socket.getPeerCertificate();
            const protocol = socket.getProtocol();
            socket.destroy();
            resolve({ cert, protocol });
        });
        socket.setTimeout(10000, () => {
            socket.destroy(new Error(`SSL connection to ${hostname} timed out`));
        });
        socket.on("error", (err) => {
            reject(err);
        });
    });
}

const getSSLCertificates = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const domain = await prisma.domain.findUnique({
            where: {
                userId: userId,
                id: id,
            },
            select: {
                id: true,
                url: true
            }
        });
        if (!domain) {
            return res.status(404).json({
                success: false,
                message: "Domain not found",
            });
        }
        const hostname = new URL(domain.url).hostname;
        const { cert, protocol } = await lookupSSLCertificate(hostname);
        return res.status(200).json({
            success: true,
            message: "SSL certificate fetched successfully",
            data: {
                issuer: cert.issuer?.O || cert.issuer?.CN || null,
                subject: cert.subject?.CN || null,
                validFrom: cert.valid_from,
                expiresAt: cert.valid_to,
                tlsVersion: protocol,
                fingerprint: cert.fingerprint256,
            }
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
}

const getDNSRecords = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const domain = await prisma.domain.findUnique({
            where: {
                userId: userId,
                id: id,
            },
            select: {
                id: true,
                url: true
            }
        });
        if (!domain) {
            return res.status(404).json({
                success: false,
                message: "Domain not found",
            });
        }
        const hostname = new URL(domain.url).hostname;
        const records = await lookupDNSRecords(hostname);

        await prisma.$transaction([
            prisma.dnsRecord.deleteMany({
                where: {
                    domainId: domain.id,
                },
            }),
            prisma.dnsRecord.createMany({
                data: records.map((record) => ({
                    ...record,
                    domainId: domain.id,
                })),
            }),
        ]);

        const dnsRecords = await prisma.dnsRecord.findMany({
            where: {
                domainId: domain.id,
            },
            orderBy: {
                type: "asc",
            },
        });
        return res.status(200).json({
            success: true,
            message: "DNS records fetched successfully",
            data: dnsRecords,
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
    addDomain,
    getDomains,
    updateDomain,
    deleteDomain,
    getDomain,
    getDNSRecords,
    getSSLCertificates
};
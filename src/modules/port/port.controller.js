const prisma = require("../../config/prisma");
const net = require("net");

const commonPorts = [
    { port: 21, service: "ftp" },
    { port: 22, service: "ssh" },
    { port: 25, service: "smtp" },
    { port: 53, service: "dns" },
    { port: 80, service: "http" },
    { port: 110, service: "pop3" },
    { port: 143, service: "imap" },
    { port: 443, service: "https" },
    { port: 3306, service: "mysql" },
    { port: 5432, service: "postgresql" },
    { port: 6379, service: "redis" },
    { port: 8080, service: "http-alt" },
    { port: 8443, service: "https-alt" },
    { port: 27017, service: "mongodb" },
];

function checkPort(host, port, timeout = 2000) {
    return new Promise((resolve) => {
        const socket = new net.Socket();

        socket.setTimeout(timeout);

        socket.connect(port, host, () => {
            socket.destroy();
            resolve(true);
        });

        socket.on("timeout", () => {
            socket.destroy();
            resolve(false);
        });

        socket.on("error", () => {
            socket.destroy();
            resolve(false);
        });
    });
}

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

const discoverPorts = async (req, res) => {
    try {
        const subdomain = await findUserSubdomain(req.params.id, req.user.id);
        if (!subdomain) {
            return res.status(404).json({
                success: false,
                message: "Subdomain not found",
            });
        }

        const host = subdomain.ipAddress || subdomain.hostname;
        const checks = await Promise.all(
            commonPorts.map(async (entry) => ({
                ...entry,
                open: await checkPort(host, entry.port),
            }))
        );

        const now = new Date();
        const openPorts = checks.filter((check) => check.open);

        const result = [];
        for (const { port, service } of openPorts) {
            const saved = await prisma.port.upsert({
                where: {
                    subdomainId_port_protocol: {
                        subdomainId: subdomain.id,
                        port,
                        protocol: "tcp",
                    },
                },
                update: {
                    state: "open",
                    service,
                    lastSeenAt: now,
                },
                create: {
                    subdomainId: subdomain.id,
                    port,
                    protocol: "tcp",
                    service,
                    state: "open",
                },
            });
            result.push(saved);
        }

        await prisma.port.updateMany({
            where: {
                subdomainId: subdomain.id,
                port: { notIn: openPorts.map((check) => check.port) },
            },
            data: {
                state: "closed",
            },
        });

        return res.status(200).json({
            success: true,
            data: result,
        });
    } catch (error) {
        console.error("Port discovery error:", error);

        return res.status(500).json({
            success: false,
            message: error.message || "Failed to discover ports",
        });
    }
};

const getPorts = async (req, res) => {
    try {
        const subdomain = await findUserSubdomain(req.params.id, req.user.id);
        if (!subdomain) {
            return res.status(404).json({
                success: false,
                message: "Subdomain not found",
            });
        }

        const result = await prisma.port.findMany({
            where: {
                subdomainId: subdomain.id,
            },
            orderBy: {
                port: "asc",
            },
        });

        return res.status(200).json({
            success: true,
            data: result,
        });
    } catch (error) {
        console.error("Port fetch error:", error);

        return res.status(500).json({
            success: false,
            message: error.message || "Failed to fetch ports",
        });
    }
};

module.exports = {
    discoverPorts,
    getPorts
};

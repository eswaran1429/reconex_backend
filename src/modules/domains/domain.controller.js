const dns = require("../../config/dns");
const prisma = require("../../config/prisma");
const { sendSuccess, sendError, serverError } = require("../../utils/response");
const { scanSecurityHeaders, scanExposedResources } = require("./security.scanner");

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
        return sendSuccess(res, 200, "Domain added successfully");
    } catch (error) {
        if (error.code === "P2002") {
            return sendError(res, 409, "Domain with this name already exists");
        }
        return serverError(res, error);
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
        return sendSuccess(res, 200, "Domains fetched successfully", domains);
    } catch (error) {
        return serverError(res, error);
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
            return sendError(res, 404, "Domain not found");
        }
        return sendSuccess(res, 200, "Domain fetched successfully", domain);
    } catch (error) {
        return serverError(res, error);
    }
}

const updateDomain = async (req, res) => {
    try {
        const userId = req.user.id;
        const domainId = req.params.id;
        const data = req.body;
        await prisma.domain.update({
            where: {
                userId: userId,
                id: domainId,
            },
            data: data
        });
        return sendSuccess(res, 200, "Domain updated successfully");

    } catch (error) {
        if (error.code === "P2025") {
            return sendError(res, 404, "Domain not found");
        }
        if (error.code === "P2002") {
            return sendError(res, 409, "Domain with this name already exists");
        }
        return serverError(res, error);
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
        return sendSuccess(res, 200, "Domain deleted successfully");
    } catch (error) {
        if (error.code === "P2025") {
            return sendError(res, 404, "Domain not found");
        }
        return serverError(res, error);
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
            return sendError(res, 404, "Domain not found");
        }
        const hostname = new URL(domain.url).hostname;
        const records = await lookupDNSRecords(hostname);

        // Nothing came back (lookup failure or no records): keep the last stored snapshot.
        if (records.length > 0) await prisma.$transaction([
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
        return sendSuccess(res, 200, "DNS records fetched successfully", dnsRecords);
    } catch (error) {
        return serverError(res, error);
    }
}

const runSnapshotScan = async (req, res, { model, scan, orderBy, label }) => {
    try {
        const domain = await prisma.domain.findUnique({
            where: {
                userId: req.user.id,
                id: req.params.id,
            },
            select: {
                id: true,
                url: true,
            },
        });
        if (!domain) {
            return sendError(res, 404, "Domain not found");
        }

        let results;
        try {
            results = await scan(domain.url);
        } catch (error) {
            return sendError(res, 502, `Could not reach ${new URL(domain.url).hostname}`, error);
        }

        const scannedAt = new Date();
        await prisma[model].createMany({
            data: results.map((result) => ({
                ...result,
                domainId: domain.id,
                scannedAt: scannedAt,
            })),
        });

        const rows = await prisma[model].findMany({
            where: {
                domainId: domain.id,
                scannedAt: scannedAt,
            },
            orderBy: orderBy,
        });
        return sendSuccess(res, 200, `${label} fetched successfully`, rows);
    } catch (error) {
        return serverError(res, error);
    }
}

const getSecurityHeaders = (req, res) => runSnapshotScan(req, res, {
    model: "securityHeader",
    scan: scanSecurityHeaders,
    orderBy: { headerName: "asc" },
    label: "Security headers",
});

const getExposedResources = (req, res) => runSnapshotScan(req, res, {
    model: "exposedResource",
    scan: scanExposedResources,
    orderBy: { path: "asc" },
    label: "Exposed resources",
});

const snapshotSources = {
    headers: {
        model: "securityHeader",
        key: "headerName",
        diff: (before, after) => {
            if (!before.present && after.present) return "header_added";
            if (before.present && !after.present) return "header_removed";
            if (before.present && after.present && before.value !== after.value) return "header_changed";
            return null;
        },
        snapshot: (row) => ({ present: row.present, value: row.value }),
    },
    exposed_resources: {
        model: "exposedResource",
        key: "path",
        diff: (before, after) => {
            if (!before.accessible && after.accessible) return "resource_exposed";
            if (before.accessible && !after.accessible) return "resource_resolved";
            if (before.statusCode !== after.statusCode) return "status_changed";
            return null;
        },
        snapshot: (row) => ({ accessible: row.accessible, statusCode: row.statusCode }),
    },
};

const findOwnedDomain = (req) => prisma.domain.findUnique({
    where: {
        userId: req.user.id,
        id: req.params.id,
    },
    select: {
        id: true,
    },
});

const selectedSources = (type) => type ? [[type, snapshotSources[type]]] : Object.entries(snapshotSources);

const paginate = (list, page, limit) => ({
    items: list.slice((page - 1) * limit, page * limit),
    pagination: {
        page,
        limit,
        total: list.length,
        totalPages: Math.ceil(list.length / limit),
    },
});

const getScanHistory = async (req, res) => {
    try {
        const domain = await findOwnedDomain(req);
        if (!domain) {
            return sendError(res, 404, "Domain not found");
        }

        const { type, page, limit } = req.validated.query;
        const snapshots = [];
        for (const [name, source] of selectedSources(type)) {
            const groups = await prisma[source.model].groupBy({
                by: ["scannedAt"],
                where: {
                    domainId: domain.id,
                },
                _count: {
                    _all: true,
                    severity: true,
                },
            });
            for (const group of groups) {
                snapshots.push({
                    type: name,
                    scannedAt: group.scannedAt,
                    total: group._count._all,
                    issues: group._count.severity,
                });
            }
        }
        snapshots.sort((a, b) => b.scannedAt - a.scannedAt);

        const result = paginate(snapshots, page, limit);
        for (const snapshot of result.items) {
            const source = snapshotSources[snapshot.type];
            snapshot.results = await prisma[source.model].findMany({
                where: {
                    domainId: domain.id,
                    scannedAt: snapshot.scannedAt,
                },
                orderBy: {
                    [source.key]: "asc",
                },
            });
        }

        return sendSuccess(res, 200, "Scan history fetched successfully", result);
    } catch (error) {
        return serverError(res, error);
    }
}

const getChanges = async (req, res) => {
    try {
        const domain = await findOwnedDomain(req);
        if (!domain) {
            return sendError(res, 404, "Domain not found");
        }

        const { type, page, limit } = req.validated.query;
        const changes = [];
        for (const [name, source] of selectedSources(type)) {
            const rows = await prisma[source.model].findMany({
                where: {
                    domainId: domain.id,
                },
                orderBy: {
                    scannedAt: "asc",
                },
            });

            const snapshots = new Map();
            for (const row of rows) {
                const time = row.scannedAt.getTime();
                if (!snapshots.has(time)) snapshots.set(time, new Map());
                snapshots.get(time).set(row[source.key], row);
            }

            let previous = null;
            for (const current of snapshots.values()) {
                if (previous) {
                    for (const [key, after] of current) {
                        const before = previous.get(key);
                        if (!before) continue;
                        const change = source.diff(before, after);
                        if (!change) continue;
                        changes.push({
                            type: name,
                            change,
                            [source.key]: key,
                            severity: after.severity ?? before.severity,
                            before: source.snapshot(before),
                            after: source.snapshot(after),
                            previousScannedAt: before.scannedAt,
                            scannedAt: after.scannedAt,
                        });
                    }
                }
                previous = current;
            }
        }
        changes.sort((a, b) => b.scannedAt - a.scannedAt);

        return sendSuccess(res, 200, "Changes fetched successfully", paginate(changes, page, limit));
    } catch (error) {
        return serverError(res, error);
    }
}

module.exports = {
    addDomain,
    getDomains,
    updateDomain,
    deleteDomain,
    getDomain,
    getDNSRecords,
    getSecurityHeaders,
    getExposedResources,
    getScanHistory,
    getChanges,
};

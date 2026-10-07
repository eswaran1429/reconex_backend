const dns = require("../../config/dns");
const prisma = require("../../config/prisma");
const { sendSuccess, sendError, serverError } = require("../../utils/response");
const { scanSecurityHeaders, scanExposedResources } = require("./security.scanner");
const { alertOnSnapshot, runAlerts, EXPIRY_WARNING_DAYS } = require("../alert/alert.service");
const { ScanError } = require("../../utils/errors");

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

const findOwnedDomain = (req) => prisma.domain.findUnique({
    where: {
        userId: req.user.id,
        id: req.params.id,
    },
    select: {
        id: true,
        url: true,
    },
});

const syncDNSRecords = async (domain) => {
    const hostname = new URL(domain.url).hostname;
    const records = await lookupDNSRecords(hostname);

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

    return prisma.dnsRecord.findMany({
        where: {
            domainId: domain.id,
        },
        orderBy: {
            type: "asc",
        },
    });
}

const getDNSRecords = async (req, res) => {
    try {
        const domain = await findOwnedDomain(req);
        if (!domain) {
            return sendError(res, 404, "Domain not found");
        }
        const dnsRecords = await syncDNSRecords(domain);
        return sendSuccess(res, 200, "DNS records fetched successfully", dnsRecords);
    } catch (error) {
        return serverError(res, error);
    }
}

const snapshotScanners = {
    securityHeader: { scan: scanSecurityHeaders, orderBy: { headerName: "asc" } },
    exposedResource: { scan: scanExposedResources, orderBy: { path: "asc" } },
};

const syncSnapshot = async (model, domain) => {
    const { scan, orderBy } = snapshotScanners[model];
    let results;
    try {
        results = await scan(domain.url);
    } catch (error) {
        throw new ScanError(`Could not reach ${new URL(domain.url).hostname}`, error);
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
    await runAlerts(() => alertOnSnapshot(model, domain.id, scannedAt, rows));
    return rows;
}

const runSnapshotScan = async (req, res, model, label) => {
    try {
        const domain = await findOwnedDomain(req);
        if (!domain) {
            return sendError(res, 404, "Domain not found");
        }
        const rows = await syncSnapshot(model, domain);
        return sendSuccess(res, 200, `${label} fetched successfully`, rows);
    } catch (error) {
        if (error instanceof ScanError) {
            return sendError(res, 502, error.message, error.cause);
        }
        return serverError(res, error);
    }
}

const getSecurityHeaders = (req, res) => runSnapshotScan(req, res, "securityHeader", "Security headers");

const getExposedResources = (req, res) => runSnapshotScan(req, res, "exposedResource", "Exposed resources");

const snapshotSources = {
    headers: {
        model: "securityHeader",
        key: "headerName",
    },
    exposed_resources: {
        model: "exposedResource",
        key: "path",
    },
};

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

const countBy = (groups, field) => Object.fromEntries(groups.map((group) => [group[field] ?? "none", group._count._all]));

const severityCounts = (rows) => rows.reduce((counts, row) => {
    if (row.severity) counts[row.severity] = (counts[row.severity] || 0) + 1;
    return counts;
}, {});

const latestSnapshot = async (model, domainId) => {
    const latest = await prisma[model].findFirst({
        where: {
            domainId: domainId,
        },
        orderBy: {
            scannedAt: "desc",
        },
        select: {
            scannedAt: true,
        },
    });
    if (!latest) return { scannedAt: null, rows: [] };
    const rows = await prisma[model].findMany({
        where: {
            domainId: domainId,
            scannedAt: latest.scannedAt,
        },
    });
    return { scannedAt: latest.scannedAt, rows };
}

const getDashboard = async (req, res) => {
    try {
        const domain = await findOwnedDomain(req);
        if (!domain) {
            return sendError(res, 404, "Domain not found");
        }

        const domainId = domain.id;
        const now = new Date();
        const expiryCutoff = new Date(now.getTime() + EXPIRY_WARNING_DAYS * 86400000);
        const weekAgo = new Date(now.getTime() - 7 * 86400000);
        const onDomain = { subdomain: { domainId } };

        const [
            details,
            subdomainsByStatus,
            lastSubdomainSeen,
            openPorts,
            dnsByType,
            technologies,
            certificates,
            headers,
            resources,
            alertsBySeverity,
            alertsLastWeek,
            recentAlerts,
            lastScan,
            recentChanges,
        ] = await Promise.all([
            prisma.domain.findUnique({
                where: { id: domainId },
                select: { id: true, name: true, url: true, status: true, createdAt: true },
            }),
            prisma.subdomain.groupBy({ by: ["status"], where: { domainId }, _count: { _all: true } }),
            prisma.subdomain.aggregate({ where: { domainId }, _max: { lastSeenAt: true } }),
            prisma.port.findMany({
                where: { ...onDomain, state: "open" },
                select: { port: true, service: true, lastSeenAt: true },
            }),
            prisma.dnsRecord.groupBy({ by: ["type"], where: { domainId }, _count: { _all: true } }),
            prisma.subdomainTechnology.findMany({
                where: onDomain,
                select: { version: true, technology: { select: { name: true, category: true } } },
            }),
            prisma.sslCertificate.findMany({
                where: onDomain,
                select: { valid: true, expiresAt: true, updatedAt: true, subdomain: { select: { hostname: true } } },
            }),
            latestSnapshot("securityHeader", domainId),
            latestSnapshot("exposedResource", domainId),
            prisma.alert.groupBy({ by: ["severity"], where: { domainId }, _count: { _all: true } }),
            prisma.alert.count({ where: { domainId, createdAt: { gte: weekAgo } } }),
            prisma.alert.findMany({ where: { domainId }, orderBy: { createdAt: "desc" }, take: 5 }),
            prisma.scan.findFirst({
                where: { domainId },
                orderBy: { createdAt: "desc" },
                select: { id: true, status: true, changeCount: true, startedAt: true, completedAt: true },
            }),
            prisma.change.findMany({ where: { domainId }, orderBy: { createdAt: "desc" }, take: 10 }),
        ]);

        const subdomainCounts = countBy(subdomainsByStatus, "status");

        const portCounts = {};
        for (const { port, service } of openPorts) {
            const key = service ? `${port}/${service}` : String(port);
            portCounts[key] = (portCounts[key] || 0) + 1;
        }

        const technologyMap = new Map();
        for (const { version, technology } of technologies) {
            const entry = technologyMap.get(technology.name) || { ...technology, versions: new Set(), subdomains: 0 };
            if (version) entry.versions.add(version);
            entry.subdomains += 1;
            technologyMap.set(technology.name, entry);
        }

        const liveCertificates = certificates
            .filter((cert) => cert.expiresAt && cert.expiresAt >= now)
            .sort((a, b) => a.expiresAt - b.expiresAt);
        const missingHeaders = headers.rows.filter((row) => !row.present);
        const exposed = resources.rows.filter((row) => row.accessible);

        const scanTimes = [
            lastSubdomainSeen._max.lastSeenAt,
            ...openPorts.map((port) => port.lastSeenAt),
            ...certificates.map((cert) => cert.updatedAt),
            headers.scannedAt,
            resources.scannedAt,
            lastScan?.completedAt,
        ].filter(Boolean).map((time) => time.getTime());

        return sendSuccess(res, 200, "Dashboard fetched successfully", {
            domain: details,
            lastScanAt: scanTimes.length ? new Date(Math.max(...scanTimes)) : null,
            lastScan: lastScan,
            subdomains: {
                total: Object.values(subdomainCounts).reduce((sum, count) => sum + count, 0),
                byStatus: subdomainCounts,
            },
            ports: {
                open: openPorts.length,
                byPort: portCounts,
            },
            dns: {
                total: dnsByType.reduce((sum, group) => sum + group._count._all, 0),
                byType: countBy(dnsByType, "type"),
            },
            technologies: {
                total: technologyMap.size,
                items: [...technologyMap.values()].map((entry) => ({ ...entry, versions: [...entry.versions] })),
            },
            ssl: {
                total: certificates.length,
                valid: certificates.filter((cert) => cert.valid === true).length,
                invalid: certificates.filter((cert) => cert.valid === false).length,
                expired: certificates.filter((cert) => cert.expiresAt && cert.expiresAt < now).length,
                expiringSoon: liveCertificates
                    .filter((cert) => cert.expiresAt <= expiryCutoff)
                    .map((cert) => ({ hostname: cert.subdomain.hostname, expiresAt: cert.expiresAt })),
                nextExpiry: liveCertificates[0]
                    ? { hostname: liveCertificates[0].subdomain.hostname, expiresAt: liveCertificates[0].expiresAt }
                    : null,
            },
            securityHeaders: {
                scannedAt: headers.scannedAt,
                checked: headers.rows.length,
                present: headers.rows.length - missingHeaders.length,
                missing: missingHeaders.map((row) => ({ headerName: row.headerName, severity: row.severity })),
                bySeverity: severityCounts(missingHeaders),
            },
            exposedResources: {
                scannedAt: resources.scannedAt,
                checked: resources.rows.length,
                accessible: exposed.map((row) => ({ path: row.path, statusCode: row.statusCode, severity: row.severity })),
                bySeverity: severityCounts(exposed),
            },
            alerts: {
                total: alertsBySeverity.reduce((sum, group) => sum + group._count._all, 0),
                lastSevenDays: alertsLastWeek,
                bySeverity: countBy(alertsBySeverity, "severity"),
                recent: recentAlerts,
            },
            recentChanges: recentChanges,
        });
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
    getDashboard,
    syncDNSRecords,
    syncSnapshot,
};

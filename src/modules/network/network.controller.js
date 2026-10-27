const prisma = require("../../config/prisma");
const { sendSuccess, sendError, serverError } = require("../../utils/response");
const { parseCidr } = require("./network.ip");
const {
    NetworkError,
    hashIdentifier,
    findOwnedNetwork,
    expireAbandonedScans,
    startScan,
    latestInventoryScan,
} = require("./network.service");
const { formatNetwork, formatScan, scanScope, formatDevice, paginated } = require("./network.format");

const DAY_MS = 24 * 60 * 60 * 1000;

const handleError = (res, error) => {
    if (error instanceof NetworkError) return sendError(res, error.status, error.message);
    return serverError(res, error);
}

// `lastScanAt` = completion time of the latest scan with a usable inventory.
const listExtras = async (networkIds) => {
    if (networkIds.length === 0) return new Map();
    const [deviceCounts, lastScans] = await Promise.all([
        prisma.networkDevice.groupBy({ by: ["networkId"], where: { networkId: { in: networkIds } }, _count: { _all: true } }),
        prisma.networkScan.groupBy({
            by: ["networkId"],
            where: { networkId: { in: networkIds }, status: { in: ["COMPLETED", "PARTIAL"] } },
            _max: { completedAt: true },
        }),
    ]);
    const extras = new Map(networkIds.map((id) => [id, { lastScanAt: null, deviceCount: 0 }]));
    for (const row of deviceCounts) extras.get(row.networkId).deviceCount = row._count._all;
    for (const row of lastScans) extras.get(row.networkId).lastScanAt = row._max.completedAt;
    return extras;
}

const addNetwork = async (req, res) => {
    try {
        const { name, subnet, identifier } = req.body;
        const network = await prisma.network.create({
            data: {
                userId: req.user.id,
                name,
                subnet: parseCidr(subnet).cidr,
                identifierHash: hashIdentifier(identifier),
            },
        });
        return sendSuccess(res, 201, "Network added successfully", formatNetwork(network, { lastScanAt: null, deviceCount: 0 }));
    } catch (error) {
        if (error.code === "P2002") return sendError(res, 409, "Network with this name already exists");
        return serverError(res, error);
    }
}

const getNetworks = async (req, res) => {
    try {
        const networks = await prisma.network.findMany({
            where: { userId: req.user.id },
            orderBy: { createdAt: "desc" },
        });
        const extras = await listExtras(networks.map((n) => n.id));
        return sendSuccess(res, 200, "Networks fetched successfully", networks.map((n) => formatNetwork(n, extras.get(n.id))));
    } catch (error) {
        return serverError(res, error);
    }
}

const getNetwork = async (req, res) => {
    try {
        const network = await findOwnedNetwork(req.user.id, req.params.id);
        if (!network) return sendError(res, 404, "Network not found");
        const extras = await listExtras([network.id]);
        return sendSuccess(res, 200, "Network fetched successfully", formatNetwork(network, extras.get(network.id)));
    } catch (error) {
        return serverError(res, error);
    }
}

const updateNetwork = async (req, res) => {
    try {
        const network = await findOwnedNetwork(req.user.id, req.params.id);
        if (!network) return sendError(res, 404, "Network not found");
        const updated = await prisma.network.update({
            where: { id: network.id },
            data: { name: req.body.name },
        });
        return sendSuccess(res, 200, "Network updated successfully", formatNetwork(updated));
    } catch (error) {
        if (error.code === "P2002") return sendError(res, 409, "Network with this name already exists");
        return serverError(res, error);
    }
}

const deleteNetwork = async (req, res) => {
    try {
        const network = await findOwnedNetwork(req.user.id, req.params.id);
        if (!network) return sendError(res, 404, "Network not found");
        await prisma.network.delete({ where: { id: network.id } });
        return sendSuccess(res, 200, "Network deleted successfully");
    } catch (error) {
        return serverError(res, error);
    }
}

const startNetworkScan = async (req, res) => {
    try {
        const network = await findOwnedNetwork(req.user.id, req.params.id);
        if (!network) return sendError(res, 404, "Network not found");
        const scan = await startScan(network);
        return sendSuccess(res, 202, "Network scan started", { ...formatScan(scan), scope: scanScope(network) });
    } catch (error) {
        return handleError(res, error);
    }
}

const getNetworkScans = async (req, res) => {
    try {
        const network = await findOwnedNetwork(req.user.id, req.params.id);
        if (!network) return sendError(res, 404, "Network not found");
        await expireAbandonedScans(network.id);

        const { page, limit, status } = req.validated.query;
        const where = { networkId: network.id, ...(status ? { status } : {}) };
        const [items, total] = await prisma.$transaction([
            prisma.networkScan.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
            prisma.networkScan.count({ where }),
        ]);
        return sendSuccess(res, 200, "Network scans fetched successfully", paginated(items.map(formatScan), page, limit, total));
    } catch (error) {
        return serverError(res, error);
    }
}

const getNetworkChanges = async (req, res) => {
    try {
        const network = await findOwnedNetwork(req.user.id, req.params.id);
        if (!network) return sendError(res, 404, "Network not found");

        const { page, limit, type, severity, scanId } = req.validated.query;
        const where = {
            networkId: network.id,
            ...(type ? { type } : {}),
            ...(severity ? { severity: { in: severity } } : {}),
            ...(scanId ? { scanId } : {}),
        };
        const [items, total] = await prisma.$transaction([
            prisma.networkChange.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
            prisma.networkChange.count({ where }),
        ]);
        return sendSuccess(res, 200, "Network changes fetched successfully", paginated(items, page, limit, total));
    } catch (error) {
        return serverError(res, error);
    }
}

/** Device ids observed in the network's latest COMPLETED scan, or null when there is none. */
const seenInLatestScan = async (networkId) => {
    const scan = await latestInventoryScan(networkId, ["COMPLETED"]);
    if (!scan) return { scan: null, ids: null };
    const rows = await prisma.networkDeviceObservation.findMany({
        where: { scanId: scan.id },
        select: { deviceId: true },
        distinct: ["deviceId"],
    });
    return { scan, ids: new Set(rows.map((r) => r.deviceId)) };
}

const latestObservationInclude = {
    observations: { orderBy: { observedAt: "desc" }, take: 1, include: { ports: true } },
};

const getNetworkDevices = async (req, res) => {
    try {
        const network = await findOwnedNetwork(req.user.id, req.params.id);
        if (!network) return sendError(res, 404, "Network not found");

        const { page, limit, seen } = req.validated.query;
        const { scan, ids } = await seenInLatestScan(network.id);
        if (seen === "latest" && !scan) return sendSuccess(res, 200, "Network devices fetched successfully", paginated([], page, limit, 0));

        const where = { networkId: network.id, ...(seen === "latest" ? { id: { in: [...ids] } } : {}) };
        const [devices, total] = await prisma.$transaction([
            prisma.networkDevice.findMany({
                where,
                include: latestObservationInclude,
                orderBy: { lastSeenAt: "desc" },
                skip: (page - 1) * limit,
                take: limit,
            }),
            prisma.networkDevice.count({ where }),
        ]);
        const items = devices.map(({ observations, ...device }) => formatDevice(device, observations[0], ids));
        return sendSuccess(res, 200, "Network devices fetched successfully", paginated(items, page, limit, total));
    } catch (error) {
        return serverError(res, error);
    }
}

const getNetworkDashboard = async (req, res) => {
    try {
        const network = await findOwnedNetwork(req.user.id, req.params.id);
        if (!network) return sendError(res, 404, "Network not found");
        await expireAbandonedScans(network.id);

        const weekAgo = new Date(Date.now() - 7 * DAY_MS);
        const [lastScan, inventoryScan, deviceTotal, newDevices, byIdentity, alertTotal, alertWeek, recentAlerts, recentChanges] =
            await Promise.all([
                prisma.networkScan.findFirst({ where: { networkId: network.id }, orderBy: { createdAt: "desc" } }),
                latestInventoryScan(network.id),
                prisma.networkDevice.count({ where: { networkId: network.id } }),
                prisma.networkDevice.count({ where: { networkId: network.id, firstSeenAt: { gte: weekAgo } } }),
                prisma.networkDevice.groupBy({ by: ["identity"], where: { networkId: network.id }, _count: { _all: true } }),
                prisma.alert.count({ where: { networkId: network.id } }),
                prisma.alert.count({ where: { networkId: network.id, createdAt: { gte: weekAgo } } }),
                prisma.alert.findMany({ where: { networkId: network.id }, orderBy: { createdAt: "desc" }, take: 5 }),
                prisma.networkChange.findMany({ where: { networkId: network.id }, orderBy: { createdAt: "desc" }, take: 10 }),
            ]);

        const observations = inventoryScan
            ? await prisma.networkDeviceObservation.findMany({
                where: { scanId: inventoryScan.id },
                select: { deviceId: true, ports: { where: { state: "open" }, select: { port: true, protocol: true } } },
            })
            : [];
        const byPort = {};
        for (const observation of observations) {
            for (const port of observation.ports) {
                const key = `${port.port}/${port.protocol}`;
                byPort[key] = (byPort[key] || 0) + 1;
            }
        }

        return sendSuccess(res, 200, "Network dashboard fetched successfully", {
            network: { id: network.id, name: network.name, subnet: network.subnet },
            lastScanAt: inventoryScan?.completedAt ?? null,
            lastScan: lastScan ? { id: lastScan.id, status: lastScan.status, changeCount: lastScan.changeCount } : null,
            devices: {
                total: deviceTotal,
                seenLastScan: inventoryScan ? new Set(observations.map((o) => o.deviceId)).size : null,
                newLastSevenDays: newDevices,
                byIdentity: Object.fromEntries(byIdentity.map((row) => [row.identity, row._count._all])),
            },
            ports: {
                open: Object.values(byPort).reduce((a, b) => a + b, 0),
                byPort,
            },
            alerts: { total: alertTotal, lastSevenDays: alertWeek, recent: recentAlerts },
            recentChanges,
        });
    } catch (error) {
        return serverError(res, error);
    }
}

module.exports = {
    addNetwork,
    getNetworks,
    getNetwork,
    updateNetwork,
    deleteNetwork,
    startNetworkScan,
    getNetworkScans,
    getNetworkChanges,
    getNetworkDevices,
    getNetworkDashboard,
    handleError,
    seenInLatestScan,
    latestObservationInclude,
};

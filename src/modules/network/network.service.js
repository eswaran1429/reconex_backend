const crypto = require("crypto");
const prisma = require("../../config/prisma");
const { isHostInSubnet } = require("./network.ip");
const { compareScans, alertsForChanges, summarize } = require("./network.compare");
const { ABANDON_AFTER_MS, MAX_DEVICES_PER_SCAN } = require("./network.constants");

/** Thrown for request problems the controller turns into an HTTP status. */
class NetworkError extends Error {
    constructor(status, message) {
        super(message);
        this.name = "NetworkError";
        this.status = status;
    }
}

const hashIdentifier = (identifier) =>
    identifier ? crypto.createHash("sha256").update(identifier).digest("hex") : null;

// Ownership: every lookup goes through the network's userId, so another user's
// records come back as null (404), never as data.

const findOwnedNetwork = (userId, id) => prisma.network.findFirst({ where: { id, userId } });

const findOwnedScan = (userId, id) => prisma.networkScan.findFirst({
    where: { id, network: { userId } },
    include: { network: true },
});

const findOwnedDevice = (userId, id) => prisma.networkDevice.findFirst({
    where: { id, network: { userId } },
});

/** Marks RUNNING scans with no upload for ABANDON_AFTER_MS as FAILED. */
const expireAbandonedScans = async (networkId) => {
    const cutoff = new Date(Date.now() - ABANDON_AFTER_MS);
    await prisma.networkScan.updateMany({
        where: {
            networkId,
            status: "RUNNING",
            OR: [
                { lastUploadAt: { lt: cutoff } },
                { lastUploadAt: null, startedAt: { lt: cutoff } },
            ],
        },
        data: { status: "FAILED", error: "Scan abandoned", completedAt: new Date() },
    });
}

const startScan = async (network) => {
    await expireAbandonedScans(network.id);
    const active = await prisma.networkScan.findFirst({
        where: { networkId: network.id, status: "RUNNING" },
    });
    if (active) throw new NetworkError(409, `Scan ${active.id} is already running for this network`);
    return prisma.networkScan.create({ data: { networkId: network.id } });
}

const identityOf = (device) => device.macAddress
    ? { identity: "mac", identityKey: `mac:${device.macAddress}` }
    : { identity: "ip", identityKey: `ip:${device.ipAddress}` };

/** Clamps a client-supplied time into [scan start, now]. */
const observationTime = (scan, observedAt) => {
    const now = new Date();
    if (!observedAt || observedAt > now || observedAt < scan.startedAt) return now;
    return observedAt;
}

const saveResults = async (scan, { devices, progress }) => {
    // Same IP twice in one request: the last entry wins.
    const unique = [...new Map(devices.map((d) => [d.ipAddress, d])).values()];

    const outside = unique.find((d) => !isHostInSubnet(d.ipAddress, scan.network.subnet));
    if (outside) {
        throw new NetworkError(400, `Invalid request: ${outside.ipAddress} is not a host address in ${scan.network.subnet}`);
    }

    return prisma.$transaction(async (tx) => {
        // Re-check inside the transaction so uploads can't land after completion.
        const current = await tx.networkScan.findUnique({ where: { id: scan.id }, select: { status: true } });
        if (current.status !== "RUNNING") throw new NetworkError(409, "Scan is no longer running");

        const existing = await tx.networkDeviceObservation.findMany({
            where: { scanId: scan.id },
            select: { ipAddress: true },
        });
        const known = new Set(existing.map((o) => o.ipAddress));
        const added = unique.filter((d) => !known.has(d.ipAddress)).length;
        if (known.size + added > MAX_DEVICES_PER_SCAN) {
            throw new NetworkError(400, `Invalid request: a scan can hold at most ${MAX_DEVICES_PER_SCAN} devices`);
        }

        for (const result of unique) {
            const observedAt = observationTime(scan, result.observedAt);
            const { identity, identityKey } = identityOf(result);
            const device = await tx.networkDevice.upsert({
                where: { networkId_identityKey: { networkId: scan.networkId, identityKey } },
                create: {
                    networkId: scan.networkId,
                    identity,
                    identityKey,
                    macAddress: result.macAddress ?? null,
                    firstSeenAt: observedAt,
                    lastSeenAt: observedAt,
                },
                update: { lastSeenAt: observedAt },
            });

            const fields = {
                deviceId: device.id,
                hostname: result.hostname ?? null,
                macAddress: result.macAddress ?? null,
                discoveryMethod: result.discoveryMethod,
                observedAt,
            };
            const observation = await tx.networkDeviceObservation.upsert({
                where: { scanId_ipAddress: { scanId: scan.id, ipAddress: result.ipAddress } },
                create: { scanId: scan.id, ipAddress: result.ipAddress, ...fields },
                update: fields,
            });

            // Re-uploading an IP replaces its port results.
            await tx.networkDevicePort.deleteMany({ where: { observationId: observation.id } });
            const ports = [...new Map(result.ports.map((p) => [`${p.port}/${p.protocol}`, p])).values()];
            if (ports.length > 0) {
                await tx.networkDevicePort.createMany({
                    data: ports.map((p) => ({
                        observationId: observation.id,
                        port: p.port,
                        protocol: p.protocol,
                        state: p.state,
                        service: p.service ?? null,
                    })),
                });
            }
        }

        await tx.networkScan.update({
            where: { id: scan.id },
            data: { lastUploadAt: new Date(), ...(progress ? { progress } : {}) },
        });

        return { received: unique.length, deviceCount: known.size + added };
    }, { timeout: 30000 });
}

const observationsForCompare = async (tx, scanId) => {
    const rows = await tx.networkDeviceObservation.findMany({
        where: { scanId },
        include: { device: { select: { identity: true, identityKey: true } }, ports: true },
    });
    return rows.map((row) => ({
        deviceId: row.deviceId,
        identity: row.device.identity,
        identityKey: row.device.identityKey,
        ipAddress: row.ipAddress,
        hostname: row.hostname,
        ports: row.ports,
    }));
}

/** Finishes a scan. COMPLETED / PARTIAL scans are compared with the previous COMPLETED scan. */
const completeScan = async (scan, { status, error }) => prisma.$transaction(async (tx) => {
    // Claim the scan first so two concurrent completes can't both run.
    const claimed = await tx.networkScan.updateMany({
        where: { id: scan.id, status: "RUNNING" },
        data: { status, error: error ?? null, completedAt: new Date() },
    });
    if (claimed.count === 0) throw new NetworkError(409, "Scan has already finished");

    if (status === "COMPLETED" || status === "PARTIAL") {
        const complete = status === "COMPLETED";
        const previousScan = await tx.networkScan.findFirst({
            where: { networkId: scan.networkId, status: "COMPLETED", id: { not: scan.id } },
            orderBy: { completedAt: "desc" },
            select: { id: true },
        });
        const current = await observationsForCompare(tx, scan.id);
        const previous = previousScan ? await observationsForCompare(tx, previousScan.id) : null;
        const changes = compareScans(previous, current, complete);

        if (changes.length > 0) {
            await tx.networkChange.createMany({
                data: changes.map((change) => ({
                    networkId: scan.networkId,
                    scanId: scan.id,
                    deviceId: change.deviceId,
                    type: change.type,
                    key: change.key,
                    severity: change.severity,
                    before: change.before ?? undefined,
                    after: change.after ?? undefined,
                })),
            });
            const alerts = alertsForChanges(changes);
            if (alerts.length > 0) {
                await tx.alert.createMany({
                    data: alerts.map((alert) => ({ ...alert, networkId: scan.networkId })),
                    skipDuplicates: true,
                });
            }
        }

        await tx.networkScan.update({
            where: { id: scan.id },
            data: { changeCount: changes.length, summary: summarize(current, changes, complete) },
        });
    }

    return tx.networkScan.findUnique({ where: { id: scan.id } });
}, { timeout: 30000 });

/** Latest finished scan that holds a usable inventory. */
const latestInventoryScan = (networkId, statuses = ["COMPLETED", "PARTIAL"]) => prisma.networkScan.findFirst({
    where: { networkId, status: { in: statuses } },
    orderBy: { completedAt: "desc" },
});

module.exports = {
    NetworkError,
    hashIdentifier,
    findOwnedNetwork,
    findOwnedScan,
    findOwnedDevice,
    expireAbandonedScans,
    startScan,
    saveResults,
    completeScan,
    latestInventoryScan,
};

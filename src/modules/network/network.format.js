// Response shapes. Unknown values stay null; nothing is guessed.

const { SCAN_PORTS, MAX_DEVICES_PER_SCAN } = require("./network.constants");

const formatNetwork = (network, extra = {}) => ({
    id: network.id,
    name: network.name,
    subnet: network.subnet,
    identifierHash: network.identifierHash,
    createdAt: network.createdAt,
    updatedAt: network.updatedAt,
    ...extra,
});

const formatScan = (scan) => ({
    id: scan.id,
    networkId: scan.networkId,
    status: scan.status,
    progress: scan.progress ?? null,
    summary: scan.summary ?? null,
    changeCount: scan.changeCount,
    error: scan.error,
    startedAt: scan.startedAt,
    completedAt: scan.completedAt,
    createdAt: scan.createdAt,
});

const scanScope = (network) => ({
    subnet: network.subnet,
    ports: SCAN_PORTS,
    maxDevices: MAX_DEVICES_PER_SCAN,
});

const formatPort = (port, observedAt) => ({
    port: port.port,
    protocol: port.protocol,
    state: port.state,
    service: port.service,
    ...(observedAt ? { observedAt } : {}),
});

const sortPorts = (ports) => [...ports].sort((a, b) => a.port - b.port || a.protocol.localeCompare(b.protocol));

const formatObservation = (observation) => ({
    id: observation.id,
    scanId: observation.scanId,
    deviceId: observation.deviceId,
    identity: observation.device?.identity ?? null,
    ipAddress: observation.ipAddress,
    hostname: observation.hostname,
    macAddress: observation.macAddress,
    discoveryMethod: observation.discoveryMethod,
    observedAt: observation.observedAt,
    ports: sortPorts(observation.ports || []).map((port) => formatPort(port)),
});

/**
 * @param latest the device's most recent observation (with ports), or undefined
 * @param seenIds device ids in the latest COMPLETED scan, or null when there is none
 */
const formatDevice = (device, latest, seenIds) => ({
    id: device.id,
    networkId: device.networkId,
    identity: device.identity,
    ipAddress: latest?.ipAddress ?? null,
    hostname: latest?.hostname ?? null,
    macAddress: device.macAddress,
    vendor: device.vendor,
    discoveryMethod: latest?.discoveryMethod ?? null,
    lastStatus: seenIds ? (seenIds.has(device.id) ? "seen" : "not_seen") : null,
    openPorts: (latest?.ports || []).filter((port) => port.state === "open").length,
    firstSeenAt: device.firstSeenAt,
    lastSeenAt: device.lastSeenAt,
    lastScanId: latest?.scanId ?? null,
});

const paginated = (items, page, limit, total) => ({
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
});

module.exports = {
    formatNetwork,
    formatScan,
    scanScope,
    formatPort,
    sortPorts,
    formatObservation,
    formatDevice,
    paginated,
};

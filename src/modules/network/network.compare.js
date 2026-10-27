// Compares two scans of the same network. Pure: takes observations, returns
// changes and alerts, touches no database.
//
// An observation is `{ deviceId, identityKey, identity, ipAddress, hostname, ports: [{ port, protocol, state, service }] }`.

const { RISKY_PORTS } = require("./network.constants");

const portKey = (port) => `${port.port}/${port.protocol}`;

// A device can be seen at more than one address in a scan; compare its first observation.
const byDevice = (observations) => {
    const devices = new Map();
    for (const observation of [...observations].sort((a, b) => a.ipAddress.localeCompare(b.ipAddress))) {
        if (!devices.has(observation.deviceId)) devices.set(observation.deviceId, observation);
    }
    return devices;
}

const portMap = (observation) => new Map((observation?.ports || []).map((port) => [portKey(port), port]));

const deviceSummary = (o) => ({ ipAddress: o.ipAddress, hostname: o.hostname ?? null, identity: o.identity });

/**
 * @param previous observations of the previous COMPLETED scan, or null when this is the first (baseline) scan
 * @param current observations of the scan being completed
 * @param complete true for COMPLETED; false for PARTIAL, which never reports absences
 */
const compareScans = (previous, current, complete) => {
    if (!previous) return [];

    const before = byDevice(previous);
    const after = byDevice(current);
    const changes = [];

    for (const [deviceId, now] of after) {
        const was = before.get(deviceId);
        if (!was) {
            changes.push({
                type: "device_added",
                severity: "medium",
                deviceId,
                key: now.identityKey,
                before: null,
                after: deviceSummary(now),
            });
        } else {
            if (now.identity === "mac" && was.ipAddress !== now.ipAddress) {
                changes.push({
                    type: "device_ip_changed",
                    severity: "info",
                    deviceId,
                    key: now.identityKey,
                    before: { ipAddress: was.ipAddress },
                    after: { ipAddress: now.ipAddress },
                });
            }
            // A missing hostname is "not resolved this time", not a change.
            if (now.hostname && now.hostname !== was.hostname) {
                changes.push({
                    type: "device_hostname_changed",
                    severity: "info",
                    deviceId,
                    key: now.identityKey,
                    before: { hostname: was.hostname ?? null },
                    after: { hostname: now.hostname },
                });
            }
        }

        const oldPorts = portMap(was);
        for (const port of now.ports || []) {
            if (port.state !== "open" || oldPorts.get(portKey(port))?.state === "open") continue;
            changes.push({
                type: "port_opened",
                severity: RISKY_PORTS.includes(port.port) ? "high" : "low",
                deviceId,
                key: `${now.identityKey}:${portKey(port)}`,
                before: null,
                after: { ipAddress: now.ipAddress, port: port.port, protocol: port.protocol, service: port.service ?? null },
            });
        }

        if (!complete || !was) continue;
        const newPorts = portMap(now);
        for (const port of was.ports || []) {
            // Only an explicit "closed" counts; filtered/unknown/missing is not evidence.
            if (port.state !== "open" || newPorts.get(portKey(port))?.state !== "closed") continue;
            changes.push({
                type: "port_closed",
                severity: "info",
                deviceId,
                key: `${now.identityKey}:${portKey(port)}`,
                before: { ipAddress: was.ipAddress, port: port.port, protocol: port.protocol, service: port.service ?? null },
                after: null,
            });
        }
    }

    if (complete) {
        for (const [deviceId, was] of before) {
            if (after.has(deviceId)) continue;
            changes.push({
                type: "device_not_seen",
                severity: "info",
                deviceId,
                key: was.identityKey,
                before: deviceSummary(was),
                after: null,
            });
        }
    }

    return changes;
}

/** Alerts for changes that deserve attention. `key` dedupes them per network. */
const alertsForChanges = (changes) => changes.flatMap((change) => {
    if (change.type === "device_added") {
        const { ipAddress, hostname } = change.after;
        return [{
            type: "network_device_discovered",
            severity: "medium",
            title: `New device on the network: ${hostname || ipAddress}`,
            message: `${hostname ? `${hostname} (${ipAddress})` : ipAddress} was not seen in the previous scan`,
            metadata: { deviceId: change.deviceId, ipAddress, hostname: hostname ?? null },
            key: `network_device:${change.key}`,
        }];
    }
    if (change.type === "port_opened" && change.severity === "high") {
        const { ipAddress, port, protocol, service } = change.after;
        return [{
            type: "network_port_opened",
            severity: "high",
            title: `Port ${port}/${protocol} open on ${ipAddress}`,
            message: `${service || "Unknown service"} is reachable on ${ipAddress}:${port}`,
            metadata: { deviceId: change.deviceId, ipAddress, port, protocol, service: service ?? null },
            key: `network_port:${change.key}`,
        }];
    }
    return [];
});

/** Counts shown on the scan and dashboard. `notSeen` is null for PARTIAL scans. */
const summarize = (current, changes, complete) => ({
    devices: byDevice(current).size,
    newDevices: changes.filter((c) => c.type === "device_added").length,
    notSeen: complete ? changes.filter((c) => c.type === "device_not_seen").length : null,
    openPorts: current.reduce((n, o) => n + (o.ports || []).filter((p) => p.state === "open").length, 0),
});

module.exports = {
    compareScans,
    alertsForChanges,
    summarize,
};

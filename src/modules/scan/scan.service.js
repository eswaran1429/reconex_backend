const prisma = require("../../config/prisma");
const { ScanError } = require("../../utils/errors");
const { syncDNSRecords, syncSnapshot } = require("../domains/domain.controller");
const { syncSubdomains, syncCertificate } = require("../subdomain/subdomain.controller");
const { syncPorts } = require("../port/port.controller");
const { syncTechnologies } = require("../technology/technology.controller");
const { riskyPorts } = require("../alert/alert.service");

const ACTIVE_STATUSES = ["QUEUED", "RUNNING"];
const HOST_CONCURRENCY = 3;

const mapLimit = async (items, limit, task) => {
    const results = new Array(items.length);
    let next = 0;
    const worker = async () => {
        while (next < items.length) {
            const index = next++;
            results[index] = await task(items[index]);
        }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
}

const stable = (value) => {
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    if (value && typeof value === "object") {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
    }
    return JSON.stringify(value);
}

const categories = {
    subdomains: {
        added: () => ["subdomain_added", "info"],
        removed: () => ["subdomain_removed", "low"],
        modified: () => ["subdomain_changed", "low"],
    },
    ports: {
        added: (after) => ["port_opened", riskyPorts[after.port] || "medium"],
        removed: () => ["port_closed", "info"],
        modified: () => ["port_changed", "info"],
        scopedToHost: true,
    },
    dns: {
        added: () => ["dns_added", "low"],
        removed: () => ["dns_removed", "low"],
        modified: () => ["dns_changed", "low"],
    },
    ssl: {
        added: () => ["ssl_added", "info"],
        removed: () => ["ssl_removed", "medium"],
        modified: (before, after) => [
            "ssl_changed",
            after.valid === false && before.valid !== false ? "high" : "low",
        ],
        scopedToHost: true,
    },
    technologies: {
        added: () => ["technology_added", "info"],
        removed: () => ["technology_removed", "info"],
        modified: () => ["technology_changed", "low"],
        scopedToHost: true,
    },
    headers: {
        modified: (before, after) => {
            if (!before.present && after.present) return ["header_added", "info"];
            if (before.present && !after.present) return ["header_removed", after.severity || "low"];
            return ["header_changed", "low"];
        },
    },
    exposed_resources: {
        modified: (before, after) => {
            if (!before.accessible && after.accessible) return ["resource_exposed", after.severity || "medium"];
            if (before.accessible && !after.accessible) return ["resource_resolved", "info"];
            return ["status_changed", "info"];
        },
    },
};

const diffSnapshots = (previous, current) => {
    const changes = [];
    const currentHosts = new Set(Object.keys(current.subdomains || {}));

    for (const [category, describe] of Object.entries(categories)) {
        const before = previous[category];
        const after = current[category];
        if (!before || !after) continue;

        const push = ([type, severity], key, beforeValue, afterValue) => {
            changes.push({ category, type, key, severity, before: beforeValue, after: afterValue });
        };

        for (const [key, value] of Object.entries(after)) {
            if (!(key in before)) {
                if (describe.added) push(describe.added(value), key, null, value);
            } else if (stable(before[key]) !== stable(value)) {
                push(describe.modified(before[key], value), key, before[key], value);
            }
        }
        for (const [key, value] of Object.entries(before)) {
            if (key in after || !describe.removed) continue;
            if (describe.scopedToHost && current.subdomains && !currentHosts.has(value.host)) continue;
            push(describe.removed(value), key, value, null);
        }
    }
    return changes;
}

const toState = (entries) => Object.fromEntries(entries);

const hostSteps = {
    ports: {
        run: syncPorts,
        state: (subdomain, ports) => ports.map((port) => [
            `${subdomain.hostname}:${port.port}/${port.protocol}`,
            { host: subdomain.hostname, port: port.port, protocol: port.protocol, service: port.service },
        ]),
    },
    ssl: {
        run: syncCertificate,
        state: (subdomain, cert) => [[
            subdomain.hostname,
            {
                host: subdomain.hostname,
                issuer: cert.issuer,
                fingerprint: cert.fingerprint,
                expiresAt: cert.expiresAt,
                valid: cert.valid,
            },
        ]],
    },
    technologies: {
        run: syncTechnologies,
        state: (subdomain, detected) => detected.map((technology) => [
            `${subdomain.hostname} ${technology.name}`,
            { host: subdomain.hostname, name: technology.name, category: technology.category, version: technology.version },
        ]),
    },
};

const runHostStep = async (step, subdomains) => {
    const { run, state } = hostSteps[step];
    const unreachable = [];
    const entries = (await mapLimit(subdomains, HOST_CONCURRENCY, async (subdomain) => {
        try {
            return state(subdomain, await run(subdomain));
        } catch (error) {
            if (!(error instanceof ScanError)) throw error;
            unreachable.push(subdomain.hostname);
            return [];
        }
    })).flat();
    return { state: toState(entries), meta: { count: entries.length, unreachable } };
}

const executeScan = async (scanId, domain) => {
    const steps = {};
    const snapshot = {};

    const runStep = async (name, task) => {
        const startedAt = new Date();
        steps[name] = { status: "running", startedAt };
        await prisma.scan.update({ where: { id: scanId }, data: { steps } });
        try {
            const { state, meta } = await task();
            snapshot[name] = state;
            steps[name] = { status: "completed", startedAt, completedAt: new Date(), ...meta };
        } catch (error) {
            snapshot[name] = null;
            steps[name] = { status: "failed", startedAt, completedAt: new Date(), error: error.message };
        }
        await prisma.scan.update({ where: { id: scanId }, data: { steps } });
    }

    try {
        await prisma.scan.update({
            where: { id: scanId },
            data: { status: "RUNNING", startedAt: new Date() },
        });

        await runStep("dns", async () => {
            const records = await syncDNSRecords(domain);
            return {
                state: toState(records.map((record) => [
                    `${record.type} ${record.value}`,
                    { type: record.type, value: record.value },
                ])),
                meta: { count: records.length },
            };
        });

        let subdomains = null;
        await runStep("subdomains", async () => {
            subdomains = await syncSubdomains(domain);
            return {
                state: toState(subdomains.map((subdomain) => [subdomain.hostname, { ipAddress: subdomain.ipAddress }])),
                meta: { count: subdomains.length },
            };
        });
        if (!subdomains) {
            subdomains = await prisma.subdomain.findMany({ where: { domainId: domain.id, status: "ACTIVE" } });
        }

        for (const step of Object.keys(hostSteps)) {
            await runStep(step, () => runHostStep(step, subdomains));
        }

        await runStep("headers", async () => {
            const rows = await syncSnapshot("securityHeader", domain);
            return {
                state: toState(rows.map((row) => [
                    row.headerName,
                    { present: row.present, value: row.value, severity: row.severity },
                ])),
                meta: { count: rows.length, missing: rows.filter((row) => !row.present).length },
            };
        });

        await runStep("exposed_resources", async () => {
            const rows = await syncSnapshot("exposedResource", domain);
            return {
                state: toState(rows.map((row) => [
                    row.path,
                    { accessible: row.accessible, statusCode: row.statusCode, severity: row.severity },
                ])),
                meta: { count: rows.length, accessible: rows.filter((row) => row.accessible).length },
            };
        });

        const current = JSON.parse(JSON.stringify(snapshot));
        const previousScans = await prisma.scan.findMany({
            where: {
                domainId: domain.id,
                id: { not: scanId },
                status: { in: ["COMPLETED", "PARTIAL"] },
            },
            orderBy: { createdAt: "desc" },
            take: 10,
            select: { snapshot: true },
        });
        const previous = {};
        for (const category of Object.keys(categories)) {
            const source = previousScans.find((scan) => scan.snapshot?.[category]);
            if (source) previous[category] = source.snapshot[category];
        }

        const changes = diffSnapshots(previous, current);
        if (changes.length > 0) {
            await prisma.change.createMany({
                data: changes.map((change) => ({ ...change, domainId: domain.id, scanId })),
            });
        }

        const failed = Object.values(steps).filter((step) => step.status === "failed").length;
        const status = failed === 0 ? "COMPLETED" : failed === Object.keys(steps).length ? "FAILED" : "PARTIAL";

        await prisma.scan.update({
            where: { id: scanId },
            data: {
                status,
                snapshot,
                changeCount: changes.length,
                completedAt: new Date(),
                error: failed > 0 ? `${failed} step(s) failed` : null,
            },
        });
    } catch (error) {
        console.error(`Scan ${scanId} failed:`, error);
        await prisma.scan.update({
            where: { id: scanId },
            data: { status: "FAILED", steps, error: error.message, completedAt: new Date() },
        }).catch((updateError) => console.error(updateError));
    }
}

const startScan = async (domain, trigger = "manual") => {
    const active = await prisma.scan.findFirst({
        where: {
            domainId: domain.id,
            status: { in: ACTIVE_STATUSES },
        },
    });
    if (active) return { active };

    const scan = await prisma.scan.create({
        data: {
            domainId: domain.id,
            trigger: trigger,
        },
    });
    setImmediate(() => executeScan(scan.id, domain));
    return { scan };
}

const recoverInterruptedScans = async () => {
    const { count } = await prisma.scan.updateMany({
        where: {
            status: { in: ACTIVE_STATUSES },
        },
        data: {
            status: "FAILED",
            error: "Interrupted by server restart",
            completedAt: new Date(),
        },
    });
    if (count > 0) console.warn(`Marked ${count} interrupted scan(s) as FAILED`);
}

module.exports = {
    STEPS: ["dns", "subdomains", ...Object.keys(hostSteps), "headers", "exposed_resources"],
    startScan,
    recoverInterruptedScans,
};

const prisma = require("../../config/prisma");

const EXPIRY_WARNING_DAYS = 30;

const riskyPorts = {
    21: "high",
    23: "high",
    3306: "high",
    5432: "high",
    6379: "critical",
    27017: "critical",
};

const saveAlerts = async (domainId, alerts) => {
    if (alerts.length === 0) return;
    await prisma.alert.createMany({
        data: alerts.map((alert) => ({ ...alert, domainId })),
        skipDuplicates: true,
    });
}

const securityHeaderAlerts = (previousRows, currentRows) => {
    const previous = new Map(previousRows.map((row) => [row.headerName, row]));
    const alerts = [];
    for (const row of currentRows) {
        const before = previous.get(row.headerName);
        if (row.present) continue;
        if (before && !before.present) continue;
        alerts.push({
            type: before ? "header_removed" : "header_missing",
            severity: row.severity || "low",
            title: before ? `Security header removed: ${row.headerName}` : `Security header missing: ${row.headerName}`,
            message: `${row.url} does not send ${row.headerName}`,
            metadata: { headerName: row.headerName, url: row.url, scannedAt: row.scannedAt },
        });
    }
    return alerts;
}

const exposedResourceAlerts = (previousRows, currentRows) => {
    const previous = new Map(previousRows.map((row) => [row.path, row]));
    const alerts = [];
    for (const row of currentRows) {
        if (!row.accessible) continue;
        if (previous.get(row.path)?.accessible) continue;
        alerts.push({
            type: "resource_exposed",
            severity: row.severity || "medium",
            title: `Exposed resource: ${row.path}`,
            message: `${row.url} is publicly accessible (HTTP ${row.statusCode})`,
            metadata: { path: row.path, url: row.url, statusCode: row.statusCode, scannedAt: row.scannedAt },
        });
    }
    return alerts;
}

const snapshotAlertBuilders = {
    securityHeader: securityHeaderAlerts,
    exposedResource: exposedResourceAlerts,
};

const alertOnSnapshot = async (model, domainId, scannedAt, currentRows) => {
    const previousScan = await prisma[model].findFirst({
        where: {
            domainId: domainId,
            scannedAt: { lt: scannedAt },
        },
        orderBy: {
            scannedAt: "desc",
        },
        select: {
            scannedAt: true,
        },
    });
    const previousRows = previousScan
        ? await prisma[model].findMany({
            where: {
                domainId: domainId,
                scannedAt: previousScan.scannedAt,
            },
        })
        : [];
    await saveAlerts(domainId, snapshotAlertBuilders[model](previousRows, currentRows));
}

const alertOnNewSubdomains = async (domainId, hadBaseline, subdomains) => {
    if (!hadBaseline) return;
    await saveAlerts(domainId, subdomains.map((subdomain) => ({
        type: "subdomain_discovered",
        severity: "info",
        title: `New subdomain: ${subdomain.hostname}`,
        message: `${subdomain.hostname} resolves to ${subdomain.ipAddress || "an unknown address"}`,
        metadata: { subdomainId: subdomain.id, hostname: subdomain.hostname, ipAddress: subdomain.ipAddress },
    })));
}

const alertOnNewPorts = async (subdomain, hadBaseline, ports) => {
    const alerts = [];
    for (const port of ports) {
        const risky = riskyPorts[port.port];
        if (!risky && !hadBaseline) continue;
        alerts.push({
            type: "port_opened",
            severity: risky || "medium",
            title: `Port ${port.port}/${port.protocol} open on ${subdomain.hostname}`,
            message: `${port.service || "Unknown service"} is reachable on ${subdomain.hostname}:${port.port}`,
            metadata: { subdomainId: subdomain.id, hostname: subdomain.hostname, port: port.port, service: port.service },
        });
    }
    await saveAlerts(subdomain.domainId, alerts);
}

const alertOnCertificate = async (subdomain, certificate) => {
    const alerts = [];
    const fingerprint = certificate.fingerprint || "unknown";
    const metadata = {
        subdomainId: subdomain.id,
        hostname: subdomain.hostname,
        fingerprint: certificate.fingerprint,
        expiresAt: certificate.expiresAt,
    };

    if (certificate.valid === false) {
        alerts.push({
            type: "ssl_invalid",
            severity: "high",
            title: `Invalid SSL certificate on ${subdomain.hostname}`,
            message: certificate.validationError || "Certificate failed validation",
            metadata,
            key: `ssl_invalid:${subdomain.id}:${fingerprint}`,
        });
    }

    if (certificate.expiresAt) {
        const daysLeft = Math.floor((certificate.expiresAt.getTime() - Date.now()) / 86400000);
        if (daysLeft < 0) {
            alerts.push({
                type: "ssl_expired",
                severity: "critical",
                title: `SSL certificate expired on ${subdomain.hostname}`,
                message: `Certificate expired on ${certificate.expiresAt.toISOString()}`,
                metadata,
                key: `ssl_expired:${subdomain.id}:${fingerprint}`,
            });
        } else if (daysLeft <= EXPIRY_WARNING_DAYS) {
            alerts.push({
                type: "ssl_expiring",
                severity: daysLeft <= 7 ? "high" : "medium",
                title: `SSL certificate expiring on ${subdomain.hostname}`,
                message: `Certificate expires in ${daysLeft} day(s) on ${certificate.expiresAt.toISOString()}`,
                metadata,
                key: `ssl_expiring:${subdomain.id}:${fingerprint}`,
            });
        }
    }

    await saveAlerts(subdomain.domainId, alerts);
}

const runAlerts = async (task) => {
    try {
        await task();
    } catch (error) {
        console.error("Alert generation failed:", error);
    }
}

module.exports = {
    EXPIRY_WARNING_DAYS,
    riskyPorts,
    alertOnSnapshot,
    alertOnNewSubdomains,
    alertOnNewPorts,
    alertOnCertificate,
    runAlerts,
};

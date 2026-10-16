const SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"];
const DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRING_DAYS = 14;

const DATABASE_PORTS = [3306, 5432, 6379, 27017];
const REMOTE_ADMIN_PORTS = [21, 22];
const OLD_TLS = ["TLSv1", "TLSv1.1", "SSLv3"];

const rules = [
    {
        ruleId: "ssl.expired",
        severity: "critical",
        test: ({ ssl, now }) => ssl?.expiresAt && ssl.expiresAt < now,
    },
    {
        ruleId: "ssl.invalid",
        severity: "high",
        test: ({ ssl }) => ssl?.valid === false,
    },
    {
        ruleId: "ssl.expiring",
        severity: "medium",
        test: ({ ssl, now }) => ssl?.expiresAt && ssl.expiresAt >= now
            && ssl.expiresAt - now <= EXPIRING_DAYS * DAY_MS,
    },
    {
        ruleId: "ssl.old_tls",
        severity: "medium",
        test: ({ ssl }) => ssl?.tlsVersion && OLD_TLS.includes(ssl.tlsVersion),
    },
    {
        ruleId: "port.database.exposed",
        severity: "high",
        test: ({ openPorts }) => DATABASE_PORTS.some((port) => openPorts.has(port)),
    },
    {
        ruleId: "port.remote_admin.exposed",
        severity: "medium",
        test: ({ openPorts }) => REMOTE_ADMIN_PORTS.some((port) => openPorts.has(port)),
    },
    {
        ruleId: "port.plaintext_http",
        severity: "low",
        test: ({ openPorts }) => openPorts.has(80) && !openPorts.has(443),
    },
    {
        ruleId: "tech.version_disclosed",
        severity: "info",
        test: ({ technologies }) => technologies.some((tech) => tech.version),
    },
];

const assessSubdomain = ({ ports, ssl, technologies }, now = new Date()) => {
    const openPorts = new Set(ports.filter((p) => p.state === "open").map((p) => p.port));
    const context = { ports, openPorts, ssl, technologies, now };

    const findings = rules
        .filter((rule) => rule.test(context))
        .map(({ ruleId, severity }) => ({ ruleId, severity }))
        .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));

    return {
        severity: findings[0]?.severity || null,
        findings,
    };
}

module.exports = {
    SEVERITY_ORDER,
    assessSubdomain,
};

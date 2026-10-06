const axios = require("axios");

const USER_AGENT = "Mozilla/5.0 (compatible; ReconexScanner/1.0)";

const headerChecks = [
    { name: "strict-transport-security", severity: "high" },
    { name: "content-security-policy", severity: "high" },
    { name: "x-frame-options", severity: "medium" },
    { name: "x-content-type-options", severity: "medium" },
    { name: "referrer-policy", severity: "low" },
    { name: "permissions-policy", severity: "low" },
    { name: "cross-origin-opener-policy", severity: "low" },
];

const resourceChecks = [
    { path: "/.env", severity: "critical", signature: /^\s*[A-Z_][A-Z0-9_]*\s*=/m },
    { path: "/.git/HEAD", severity: "critical", signature: /^ref:\s*refs\//m },
    { path: "/.git/config", severity: "critical", signature: /\[core\]/ },
    { path: "/.svn/entries", severity: "high", signature: /^(?:\d+\s*$|dir\s*$)/m },
    { path: "/.aws/credentials", severity: "critical", signature: /aws_access_key_id/i },
    { path: "/wp-config.php.bak", severity: "critical", signature: /DB_PASSWORD/ },
    { path: "/config.php.bak", severity: "high", signature: /<\?php/ },
    { path: "/backup.sql", severity: "critical", signature: /CREATE TABLE|INSERT INTO/i },
    { path: "/dump.sql", severity: "critical", signature: /CREATE TABLE|INSERT INTO/i },
    { path: "/backup.zip", severity: "high", signature: /^PK\x03\x04/ },
    { path: "/docker-compose.yml", severity: "medium", signature: /^services:/m },
    { path: "/.htaccess", severity: "medium", signature: /RewriteEngine|Deny from|Require /i },
    { path: "/.DS_Store", severity: "low", signature: /Bud1/ },
    { path: "/phpinfo.php", severity: "medium", signature: /phpinfo\(\)|PHP Version/ },
    { path: "/server-status", severity: "medium", signature: /Apache Server Status/i },
];

const scanSecurityHeaders = async (url) => {
    const response = await axios.get(url, {
        timeout: 10000,
        maxRedirects: 5,
        maxContentLength: 2 * 1024 * 1024,
        responseType: "text",
        validateStatus: () => true,
        headers: { "User-Agent": USER_AGENT },
    });

    const finalUrl = response.request?.res?.responseUrl || url;
    return headerChecks.map(({ name, severity }) => {
        const value = response.headers[name];
        const present = value !== undefined && value !== "";
        return {
            url: finalUrl,
            headerName: name,
            present,
            value: present ? String(value) : null,
            severity: present ? null : severity,
        };
    });
}

const readHead = (stream, limit) => new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    const finish = () => {
        stream.destroy();
        resolve(Buffer.concat(chunks).toString("latin1"));
    };
    stream.on("data", (chunk) => {
        chunks.push(chunk);
        size += chunk.length;
        if (size >= limit) finish();
    });
    stream.on("end", finish);
    stream.on("error", finish);
});

const probe = async (origin, { path, severity, signature }) => {
    const url = `${origin}${path}`;
    try {
        const response = await axios.get(url, {
            timeout: 8000,
            maxRedirects: 0,
            responseType: "stream",
            validateStatus: () => true,
            headers: { "User-Agent": USER_AGENT },
        });
        const body = response.status === 200 ? await readHead(response.data, 64 * 1024) : (response.data.destroy(), "");
        const accessible = response.status === 200 && signature.test(body);
        return { url, path, statusCode: response.status, accessible, severity: accessible ? severity : null };
    } catch (error) {
        return { url, path, statusCode: null, accessible: false, severity: null };
    }
}

const scanExposedResources = async (url) => {
    const { origin } = new URL(url);
    const results = await Promise.all(resourceChecks.map((check) => probe(origin, check)));
    if (results.every((result) => result.statusCode === null)) {
        throw new Error(`Could not reach ${origin}`);
    }
    return results;
}

module.exports = {
    scanSecurityHeaders,
    scanExposedResources,
};

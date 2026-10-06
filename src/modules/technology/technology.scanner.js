const axios = require("axios");

const rules = [
    {
        name: "Nginx",
        category: "Web Server",
        headers: { server: /nginx(?:\/([\d.]+))?|openresty/i },
    },
    {
        name: "Apache",
        category: "Web Server",
        headers: { server: /apache(?:\/([\d.]+))?/i },
    },
    {
        name: "Cloudflare",
        category: "CDN",
        headers: { server: /cloudflare/i, "cf-ray": /.+/ },
    },
    {
        name: "Express",
        category: "Web Framework",
        headers: { "x-powered-by": /express/i },
        implies: ["Node.js"],
    },
    {
        name: "Node.js",
        category: "Runtime",
        headers: { "x-powered-by": /node(?:\.js)?(?:\/v?([\d.]+))?/i },
    },
    {
        name: "Next.js",
        category: "Web Framework",
        headers: { "x-powered-by": /next\.js\s*([\d.]+)?/i },
        html: [/__NEXT_DATA__/, /\/_next\/static\//],
        scripts: [/\/_next\//],
        implies: ["React", "Node.js"],
    },
    {
        name: "React",
        category: "JavaScript Library",
        html: [/data-reactroot/, /data-reactid/],
        scripts: [/react(?:-dom)?(?:\.production)?(?:\.min)?\.js/i, /react@([\d.]+)/i],
    },
    {
        name: "WordPress",
        category: "CMS",
        meta: { generator: /wordpress\s*([\d.]+)?/i },
        html: [/\/wp-content\//, /\/wp-includes\//],
        scripts: [/\/wp-(?:content|includes)\//],
    },
];

const fetchPage = async (hostname) => {
    const options = {
        timeout: 10000,
        maxRedirects: 5,
        maxContentLength: 2 * 1024 * 1024,
        responseType: "text",
        validateStatus: () => true,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; ReconexScanner/1.0)" },
    };

    try {
        return await axios.get(`https://${hostname}`, options);
    } catch (error) {
        return await axios.get(`http://${hostname}`, options);
    }
}

const getMetaTags = (html) => {
    const meta = {};
    for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
        const name = tag.match(/\bname\s*=\s*["']([^"']+)["']/i);
        const content = tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i);
        if (name && content) meta[name[1].toLowerCase()] = content[1];
    }
    return meta;
}

const getScriptSources = (html) => {
    return [...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);
}

const matchAny = (regexes, values) => {
    for (const regex of regexes) {
        for (const value of values) {
            const match = regex.exec(value);
            if (match) return { matched: true, version: match[1] || null };
        }
    }
    return { matched: false, version: null };
}

const detect = (headers, html) => {
    const meta = getMetaTags(html);
    const scripts = getScriptSources(html);
    const found = new Map();

    for (const rule of rules) {
        const checks = [];

        for (const [header, regex] of Object.entries(rule.headers || {})) {
            if (headers[header]) checks.push(matchAny([regex], [String(headers[header])]));
        }
        for (const [name, regex] of Object.entries(rule.meta || {})) {
            if (meta[name]) checks.push(matchAny([regex], [meta[name]]));
        }
        if (rule.html) checks.push(matchAny(rule.html, [html]));
        if (rule.scripts) checks.push(matchAny(rule.scripts, scripts));

        const hits = checks.filter((check) => check.matched);
        if (hits.length > 0) {
            const version = hits.find((hit) => hit.version)?.version || null;
            found.set(rule.name, { name: rule.name, category: rule.category, version });
        }
    }

    for (const rule of rules) {
        if (!found.has(rule.name)) continue;
        for (const implied of rule.implies || []) {
            if (!found.has(implied)) {
                const impliedRule = rules.find((r) => r.name === implied);
                found.set(implied, { name: implied, category: impliedRule.category, version: null });
            }
        }
    }

    return [...found.values()];
}

const scanTechnologies = async (hostname) => {
    const response = await fetchPage(hostname);
    const html = typeof response.data === "string" ? response.data : "";
    return detect(response.headers, html);
}

module.exports = {
    scanTechnologies,
};

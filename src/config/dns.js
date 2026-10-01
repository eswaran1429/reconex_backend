const { Resolver } = require("dns").promises;

// Scanners use public DNS servers instead of the machine's own setting,
// so results don't depend on local DNS (e.g. a VPN or proxy on 127.0.0.1).
const resolver = new Resolver({ timeout: 5000, tries: 2 });
resolver.setServers(["1.1.1.1", "8.8.8.8"]);

module.exports = resolver;

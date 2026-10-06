const { Resolver } = require("dns").promises;

const resolver = new Resolver({ timeout: 5000, tries: 2 });
resolver.setServers(["1.1.1.1", "8.8.8.8"]);

module.exports = resolver;

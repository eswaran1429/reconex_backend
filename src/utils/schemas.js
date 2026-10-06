const { z } = require("zod");

const prefixedId = (prefix) => z.string().regex(new RegExp(`^${prefix}_\\d+$`), `Must look like ${prefix}_1`);

const idParam = (prefix) => z.object({ id: prefixedId(prefix) });

const httpUrl = z.string().trim().refine((value) => {
    try {
        const { protocol, hostname } = new URL(value);
        return (protocol === "http:" || protocol === "https:") && hostname.length > 0;
    } catch (error) {
        return false;
    }
}, "Must start with http:// or https://");

const pagination = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
});

module.exports = {
    z,
    prefixedId,
    idParam,
    httpUrl,
    pagination,
};

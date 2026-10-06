const { sendError } = require("../utils/response");

const formatIssues = (part, issues) => issues
    .map((issue) => {
        const path = [part, ...issue.path].join(".");
        return `${path}: ${issue.message}`;
    })
    .join("; ");

const validate = (schemas) => (req, res, next) => {
    req.validated = {};
    for (const part of ["params", "query", "body"]) {
        if (!schemas[part]) continue;

        const result = schemas[part].safeParse(req[part] ?? {});
        if (!result.success) {
            return sendError(res, 400, `Invalid request: ${formatIssues(part, result.error.issues)}`);
        }

        req.validated[part] = result.data;
        if (part === "body") req.body = result.data;
    }
    next();
}

module.exports = {
    validate,
};

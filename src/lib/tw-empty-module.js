// A module that exists so a browser build can resolve an import it never takes.
// See webpack.config.js: Emscripten glue requires "node:fs" behind an
// ENVIRONMENT_IS_NODE guard, and webpack 4 resolves imports it will never run.
module.exports = {};

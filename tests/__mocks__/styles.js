// CSS modules keep stable class names in DOM tests; visual rules run in CUA.
module.exports = new Proxy({}, { get: (_target, name) => name === '__esModule' ? false : String(name) })

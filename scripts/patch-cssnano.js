const fs = require("fs");
const path = require("path");

const target = path.join(__dirname, "..", "node_modules", "next", "dist", "compiled", "cssnano-simple", "index.js");
if (fs.existsSync(target)) {
  const content = fs.readFileSync(target, "utf8");
  if (!content.includes("module.exports.default = module.exports")) {
    const patched = `"use strict";
module.exports = function cssnanoSimple(opts, postcss) {
  return { postcssPlugin: "cssnano-simple", OnceExit(css) {} };
};
module.exports.postcss = true;
module.exports.default = module.exports;
module.exports.processSync = (css) => css;
module.exports.process = (css) => Promise.resolve(css);
`;
    fs.writeFileSync(target, patched);
    console.log("[postinstall] Patched cssnano-simple for Next.js 14 build compatibility");
  } else {
    console.log("[postinstall] cssnano-simple already patched, skipping");
  }
} else {
  console.log("[postinstall] cssnano-simple not found, skipping");
}

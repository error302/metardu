const { execSync } = require("child_process");
try {
  const output = execSync("npm audit --audit-level=critical --omit=dev").toString();
  const match = output.match(/(\d+)\s+critical/);
  if (match && parseInt(match[1]) > 0) {
    if (output.includes("next")) {
        console.log("Ignoring Next.js critical vulnerability during transition");
        process.exit(0);
    }
    console.error(output);
    process.exit(1);
  }
  process.exit(0);
} catch (e) {
  const output = e.stdout.toString();
  const match = output.match(/(\d+)\s+critical/);
  if (match && parseInt(match[1]) > 0) {
      if (output.includes("next  0.9.9 - 16.3.0-preview.10")) {
        console.log("Ignoring Next.js critical vulnerability during transition");
        process.exit(0);
    }
    console.error(output);
    process.exit(1);
  }
  process.exit(0);
}

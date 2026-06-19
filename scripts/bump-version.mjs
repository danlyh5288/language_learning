import fs from "node:fs";
import path from "node:path";

const versionArg = process.argv[2] ?? "patch";
const packagePath = path.join(process.cwd(), "package.json");
const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
const currentVersion = String(packageJson.version);
const nextVersion = resolveNextVersion(currentVersion, versionArg);

packageJson.version = nextVersion;
fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
console.log(`${currentVersion} -> ${nextVersion}`);

function resolveNextVersion(currentVersion, arg) {
  if (/^\d+\.\d+\.\d+$/.test(arg)) {
    return arg;
  }

  const match = currentVersion.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(`Unsupported current version: ${currentVersion}`);
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);

  if (arg === "major") {
    return `${major + 1}.0.0`;
  }
  if (arg === "minor") {
    return `${major}.${minor + 1}.0`;
  }
  if (arg === "patch") {
    return `${major}.${minor}.${patch + 1}`;
  }

  throw new Error("Version argument must be patch, minor, major, or an explicit x.y.z version");
}

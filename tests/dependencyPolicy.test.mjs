import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const packageLock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
const workflow = readFileSync(
  join(root, ".github", "workflows", "family-sync-tests.yml"),
  "utf8",
);

const expectedDependencies = {
  next: "16.2.6",
  react: "19.2.6",
  "react-dom": "19.2.6",
  "lucide-react": "1.16.0",
};

const expectedDevDependencies = {
  typescript: "6.0.3",
  "@types/node": "25.9.1",
  "@types/react": "19.2.15",
  "@types/react-dom": "19.2.3",
  eslint: "9.39.4",
  "eslint-config-next": "16.2.6",
};

function assertExactVersions(actual, expected) {
  assert.deepEqual(actual, expected);
  for (const version of Object.values(actual)) {
    assert.match(version, /^\d+\.\d+\.\d+$/);
    assert.notEqual(version, "latest");
  }
}

test("frontend direct dependencies are pinned to the known-good baseline", () => {
  assertExactVersions(packageJson.dependencies, expectedDependencies);
  assertExactVersions(packageJson.devDependencies, expectedDevDependencies);
  assert.equal(packageJson.engines?.node, "22.x");
});

test("package-lock root metadata matches the pinned package manifest", () => {
  const lockRoot = packageLock.packages?.[""];
  assert.ok(lockRoot, "package-lock.json must contain root package metadata");
  assert.deepEqual(lockRoot.dependencies, expectedDependencies);
  assert.deepEqual(lockRoot.devDependencies, expectedDevDependencies);
  assert.equal(lockRoot.engines?.node, "22.x");
});

test("package-lock resolves every direct dependency to the pinned version", () => {
  const allExpected = { ...expectedDependencies, ...expectedDevDependencies };
  for (const [name, version] of Object.entries(allExpected)) {
    const locked = packageLock.packages?.[`node_modules/${name}`]?.version;
    assert.equal(locked, version, `${name} lockfile version must match package.json`);
  }
});

test("CI uses Node 22 and deterministic npm ci installs", () => {
  assert.match(workflow, /node-version:\s*22\b/);
  assert.match(workflow, /run:\s*npm ci\b/);
  assert.doesNotMatch(workflow, /run:\s*npm install\b/);
});

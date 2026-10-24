/** Synthetic runtime configuration. A Render instance must have an actual mounted volume. */
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

export function validateVolume({ dataDir, volumeRoot, mountInfo }) {
  if (
    !isAbsolute(dataDir ?? "") ||
    !isAbsolute(volumeRoot ?? "") ||
    volumeRoot === "/"
  )
    throw Error("Explicit synthetic volume required");
  const root = resolve(volumeRoot),
    data = resolve(dataDir);
  const suffix = relative(root, data);
  if (
    root !== volumeRoot ||
    data !== dataDir ||
    !suffix ||
    suffix.startsWith("..") ||
    isAbsolute(suffix)
  )
    throw Error("Synthetic data must be below its volume");
  const mounts = mountInfo
    .trim()
    .split("\n")
    .map((line) => {
      const [fields, filesystem] = line.split(" - ");
      const columns = fields.split(" ");
      return {
        path: columns[4]?.replace(/\\([0-7]{3})/g, (_, octal) =>
          String.fromCharCode(parseInt(octal, 8)),
        ),
        options: columns[5]?.split(","),
        type: filesystem?.split(" ")[0],
      };
    });
  const mount = mounts.find((item) => item.path === root);
  if (
    !mount ||
    !["ext4", "xfs", "btrfs"].includes(mount.type) ||
    !mount.options?.includes("rw")
  )
    throw Error("Writable persistent filesystem mount required");
  // A nested ephemeral mount would otherwise hide the persistent parent.
  if (
    mounts.some(
      (item) =>
        item.path !== root &&
        item.path &&
        !relative(root, item.path).startsWith("..") &&
        (data === item.path || data.startsWith(item.path + "/")),
    )
  )
    throw Error("Nested mount hides synthetic volume");
}

export function readTestConfig(env = process.env) {
  const {
    BORVAT_TEST_DATA_DIR: dataDir,
    BORVAT_TEST_ORIGIN: origin,
    BORVAT_NATIVE_BINDINGS_FILE: file,
  } = env;
  if (!dataDir || !origin || !file)
    throw Error("Connected test not configured");
  const privateFile = lstatSync(file);
  if (
    !privateFile.isFile() ||
    privateFile.mode & 0o077 ||
    realpathSync(file) !== file
  )
    throw Error("Native binding must be a private regular file");
  const hosted = env.RENDER === "true";
  if (hosted) {
    if (
      env.BORVAT_TEST_DEPLOYMENT !== "render-synthetic" ||
      origin !== env.RENDER_EXTERNAL_URL ||
      new URL(origin).protocol !== "https:"
    )
      throw Error("Explicit isolated Render origin required");
    const volumeRoot = env.BORVAT_TEST_VOLUME_ROOT;
    validateVolume({
      dataDir,
      volumeRoot,
      mountInfo: readFileSync("/proc/self/mountinfo", "utf8"),
    });
    if (
      realpathSync(volumeRoot) !== volumeRoot ||
      realpathSync(dataDir) !== dataDir
    )
      throw Error("Synthetic volume cannot be a symlink");
  }
  const bindings = JSON.parse(readFileSync(file, "utf8"));
  if (
    !bindings ||
    Array.isArray(bindings) ||
    typeof bindings !== "object" ||
    Object.keys(bindings).length === 0 ||
    Object.entries(bindings).some(
      ([company, binding]) =>
        !["TEST-A", "TEST-B"].includes(company) ||
        !binding ||
        binding.company !== company,
    )
  )
    throw Error("Synthetic company bindings required");
  return { dataDir, origin, bindings, hosted };
}

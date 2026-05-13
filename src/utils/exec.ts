import { spawn, type SpawnOptions } from "node:child_process";

export interface ExecOptions extends SpawnOptions {
  /** stdin payload to write before closing */
  stdin?: string;
  /** abort if the child runs longer than this (ms) */
  timeoutMs?: number;
}

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Spawn a subprocess and collect stdout/stderr. Throws on non-zero exit. */
export async function exec(
  cmd: string,
  args: string[],
  opts: ExecOptions = {}
): Promise<ExecResult> {
  const { stdin, timeoutMs, ...spawnOpts } = opts;
  return await new Promise<ExecResult>((resolve, reject) => {
    const proc = spawn(cmd, args, {
      stdio: ["pipe", "pipe", "pipe"],
      ...spawnOpts,
    });
    let stdout = "";
    let stderr = "";
    let timer: NodeJS.Timeout | undefined;

    proc.stdout?.on("data", (d: Buffer) => (stdout += d.toString("utf8")));
    proc.stderr?.on("data", (d: Buffer) => (stderr += d.toString("utf8")));

    proc.on("error", (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
    proc.on("exit", (code) => {
      if (timer) clearTimeout(timer);
      const c = code ?? -1;
      if (c !== 0) {
        reject(
          new Error(
            `\`${cmd} ${args.join(" ")}\` exited ${c}\n${stderr.trim() || stdout.trim()}`
          )
        );
        return;
      }
      resolve({ code: c, stdout, stderr });
    });

    if (timeoutMs && timeoutMs > 0) {
      timer = setTimeout(() => {
        proc.kill("SIGKILL");
        reject(new Error(`\`${cmd}\` timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    }

    if (stdin !== undefined) {
      proc.stdin?.write(stdin);
      proc.stdin?.end();
    } else {
      proc.stdin?.end();
    }
  });
}

/** Returns true if `cmd` is on PATH. */
export async function which(cmd: string): Promise<boolean> {
  try {
    await exec(process.platform === "win32" ? "where" : "which", [cmd]);
    return true;
  } catch {
    return false;
  }
}

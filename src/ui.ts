import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applyPlan, CLI_VERSION } from "./apply.ts";
import { ProjectContext } from "./context.ts";
import { doctorProject } from "./doctor.ts";
import { projectStatus } from "./status.ts";
import { effectiveCapabilities } from "./resolver.ts";

export interface UiServerOptions {
  port?: number;
  openBrowser?: boolean;
  quiet?: boolean;
}

export interface UiServerHandle {
  server: Server;
  url: string;
  close(): Promise<void>;
}

const UI_FILES = {
  "/": { name: "index.html", contentType: "text/html; charset=utf-8" },
  "/app.js": { name: "app.js", contentType: "text/javascript; charset=utf-8" },
  "/styles.css": { name: "styles.css", contentType: "text/css; charset=utf-8" }
} as const;

function sendJson(response: ServerResponse, statusCode: number, value: unknown): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer"
  });
  response.end(JSON.stringify(value));
}

function sendAsset(response: ServerResponse, contentType: string, content: string): void {
  response.writeHead(200, {
    "content-type": contentType,
    "cache-control": "no-store",
    "content-security-policy":
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer"
  });
  response.end(content);
}

function planSummary(entries: Array<{ action: string }>): Record<string, number> {
  return {
    create: entries.filter((entry) => entry.action === "create").length,
    update: entries.filter((entry) => entry.action === "update").length,
    unchanged: entries.filter((entry) => entry.action === "unchanged").length,
    skip: entries.filter((entry) => entry.action === "skip").length,
    conflict: entries.filter((entry) => entry.action === "conflict").length
  };
}

async function buildOverview(projectRoot: string, csrfToken: string): Promise<unknown> {
  const context = new ProjectContext(projectRoot);
  const [manifest, packs, plan] = await Promise.all([
    context.manifest(),
    context.packs(),
    context.plan()
  ]);
  const [status, doctor] = await Promise.all([
    projectStatus(projectRoot, context),
    doctorProject(projectRoot)
  ]);

  const needsAttention =
    !status.healthy ||
    !doctor.healthy ||
    status.files.pending > 0 ||
    doctor.diagnostics.some((item) => item.severity === "warning" || item.severity === "error");

  return {
    version: CLI_VERSION,
    root: context.root,
    csrfToken,
    project: {
      ...status.project,
      description: manifest.metadata.description ?? "",
      owners: manifest.metadata.owners,
      maturity: manifest.spec.maturity ?? null,
      criticality: manifest.spec.criticality ?? null,
      visibility: manifest.spec.visibility ?? null
    },
    health: {
      healthy: !needsAttention,
      state: needsAttention ? "attention" : "healthy"
    },
    status,
    plan: {
      summary: planSummary(plan.entries),
      entries: plan.entries.map(({ desiredContent: _desiredContent, desiredHash: _desiredHash, ...entry }) => entry)
    },
    diagnostics: doctor.diagnostics,
    packs: packs.map(({ manifest: pack }) => ({
      id: pack.metadata.id,
      version: pack.metadata.version,
      description: pack.metadata.description ?? "",
      provides: pack.provides ?? []
    })),
    components: manifest.spec.components.map((component) => ({
      id: component.id,
      path: component.path,
      languages: component.languages ?? [],
      capabilities: Object.keys(effectiveCapabilities(manifest, packs, component.id))
    }))
  };
}

function openInBrowser(url: string): void {
  const command =
    process.platform === "win32"
      ? { file: "cmd", args: ["/c", "start", "", url] }
      : process.platform === "darwin"
        ? { file: "open", args: [url] }
        : { file: "xdg-open", args: [url] };
  const child = spawn(command.file, command.args, {
    stdio: "ignore",
    detached: true,
    windowsHide: true
  });
  child.on("error", () => undefined);
  child.unref();
}

function isAuthorizedMutation(request: IncomingMessage, csrfToken: string): boolean {
  const token = request.headers["x-armonia-token"];
  return typeof token === "string" && token === csrfToken;
}

export async function startUiServer(
  projectRoot: string,
  options: UiServerOptions = {}
): Promise<UiServerHandle> {
  const root = resolve(projectRoot);
  const csrfToken = randomBytes(24).toString("base64url");
  const assets = new Map<string, string>();
  for (const [route, asset] of Object.entries(UI_FILES)) {
    const path = fileURLToPath(new URL(`../ui/${asset.name}`, import.meta.url));
    assets.set(route, await readFile(path, "utf8"));
  }

  const server = createServer(async (request, response) => {
    try {
      const method = request.method ?? "GET";
      const url = new URL(request.url ?? "/", "http://127.0.0.1");

      if (method === "GET" && url.pathname === "/api/overview") {
        sendJson(response, 200, await buildOverview(root, csrfToken));
        return;
      }

      if (method === "POST" && url.pathname === "/api/apply") {
        if (!isAuthorizedMutation(request, csrfToken)) {
          sendJson(response, 403, { error: "Invalid or missing local UI token." });
          return;
        }
        const context = new ProjectContext(root);
        const plan = await context.plan();
        const result = await applyPlan(plan);
        sendJson(response, 200, { result });
        return;
      }

      if (method === "GET" && url.pathname in UI_FILES) {
        const asset = UI_FILES[url.pathname as keyof typeof UI_FILES];
        sendAsset(response, asset.contentType, assets.get(url.pathname) ?? "");
        return;
      }

      sendJson(response, 404, { error: "Not found" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown UI server error";
      sendJson(response, 500, { error: message });
    }
  });

  const requestedPort = options.port ?? 0;
  await new Promise<void>((resolveListen, rejectListen) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      rejectListen(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolveListen();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(requestedPort, "127.0.0.1");
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    throw new Error("Unable to determine the local UI address.");
  }
  const url = `http://127.0.0.1:${address.port}/`;

  if (!options.quiet) {
    process.stdout.write(`Armonìa UI: ${url}\nProject: ${root}\n`);
    process.stdout.write("Close this terminal to stop the local UI.\n");
  }
  if (options.openBrowser !== false) {
    openInBrowser(url);
  }

  return {
    server,
    url,
    close: () =>
      new Promise<void>((resolveClose, rejectClose) => {
        server.close((error) => (error ? rejectClose(error) : resolveClose()));
      })
  };
}

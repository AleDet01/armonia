export function pagesDeployment(environment = process.env) {
  const parts = (environment.GITHUB_REPOSITORY ?? "").split("/");
  const [owner, repository] = parts;
  if (environment.GITHUB_ACTIONS !== "true" || !owner || !repository) return { prefix: "", url: "http://localhost:3000/" };
  if (parts.length !== 2 || !/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repository) || [".", ".."].includes(repository)) throw new Error("Invalid GitHub repository identifier");
  const prefix = repository.toLowerCase() === `${owner.toLowerCase()}.github.io` ? "" : `/${repository}`;
  return { prefix, url: `https://${owner}.github.io${prefix}/` };
}

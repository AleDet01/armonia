let state = null;

const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]));

function pill(label, value, tone = "") {
  return '<span class="chip ' + tone + '">' + esc(label) + ': ' + esc(value) + '</span>';
}

function render(data) {
  state = data;
  const attention = data.health.state !== "healthy";
  $("healthBadge").textContent = attention ? "Richiede attenzione" : "Tutto in ordine";
  $("healthBadge").className = "badge " + (attention ? "warn" : "ok");

  $("summary").innerHTML = [
    ["Pack", data.status.packs],
    ["Componenti", data.status.components],
    ["Modifiche pending", data.status.files.pending],
    ["Conflitti", data.status.files.conflicts]
  ].map(([label, value]) => '<div class="card"><span class="eyebrow">' + esc(label) + '</span><strong>' + esc(value) + '</strong></div>').join("");

  $("projectName").textContent = data.project.name + " · " + data.project.id;
  $("projectDescription").textContent = data.project.description || "Nessuna descrizione impostata.";
  $("projectMeta").innerHTML = [
    pill("Lifecycle", data.project.lifecycle),
    pill("Profilo", data.project.profile),
    data.project.maturity ? pill("Maturità", data.project.maturity) : "",
    data.project.criticality ? pill("Criticità", data.project.criticality) : "",
    data.project.visibility ? pill("Visibilità", data.project.visibility) : ""
  ].join("");

  const summary = data.plan.summary;
  $("planSummary").innerHTML = [
    pill("Da creare", summary.create, summary.create ? "warn" : "ok"),
    pill("Da aggiornare", summary.update, summary.update ? "warn" : "ok"),
    pill("Conflitti", summary.conflict, summary.conflict ? "bad" : "ok"),
    pill("Invariati", summary.unchanged + summary.skip, "ok")
  ].join("");

  $("planEntries").innerHTML = data.plan.entries.length
    ? data.plan.entries.map((entry) => {
        const tone = entry.action === "conflict" ? "bad" : (entry.action === "create" || entry.action === "update" ? "warn" : "ok");
        return '<div class="item"><div class="item-head"><span class="item-title">' + esc(entry.path) + '</span>' +
          '<span class="chip ' + tone + '">' + esc(entry.action) + '</span></div><p>' + esc(entry.reason) + '</p></div>';
      }).join("")
    : '<div class="item"><span class="item-title">Nessuna modifica pianificata.</span></div>';

  const diagnostics = data.diagnostics;
  $("diagnostics").innerHTML = diagnostics.length
    ? diagnostics.map((d) => {
        const tone = d.severity === "error" ? "bad" : (d.severity === "warning" ? "warn" : "ok");
        return '<div class="item"><div class="item-head"><span class="item-title">' + esc(d.rule) + '</span>' +
          '<span class="chip ' + tone + '">' + esc(d.severity) + '</span></div><p>' + esc(d.message) + '</p>' +
          (d.remediation ? '<p><strong>Cosa fare:</strong> ' + esc(d.remediation) + '</p>' : '') + '</div>';
      }).join("")
    : '<div class="item"><span class="item-title">Nessun problema rilevato.</span></div>';

  $("packs").innerHTML = data.packs.map((pack) =>
    '<div class="item"><div class="item-head"><span class="item-title">' + esc(pack.id) + '</span><small>' + esc(pack.version) +
    '</small></div><p>' + esc(pack.description || (pack.provides.length ? "Fornisce: " + pack.provides.join(", ") : "Pack attivo")) + '</p></div>'
  ).join("");

  $("components").innerHTML = data.components.map((component) =>
    '<div class="item"><div class="item-head"><span class="item-title">' + esc(component.id) + '</span><small>' + esc(component.path) +
    '</small></div><p>' + esc((component.languages.length ? component.languages.join(", ") : "generico") +
    (component.capabilities.length ? " · " + component.capabilities.length + " capability locali" : "")) + '</p></div>'
  ).join("");

  const hasChanges = summary.create + summary.update > 0;
  $("applyButton").disabled = !hasChanges || summary.conflict > 0;
  $("applyButton").title = summary.conflict > 0
    ? "Risolvi i conflitti prima di applicare."
    : (hasChanges ? "Applica le modifiche sicure del piano." : "Nessuna modifica da applicare.");

  $("footerVersion").textContent = "Armonìa " + data.version;
  $("projectRoot").textContent = data.root;
}

async function load() {
  $("refreshButton").disabled = true;
  try {
    const response = await fetch("/api/overview", { cache: "no-store" });
    if (!response.ok) throw new Error("Impossibile caricare lo stato.");
    render(await response.json());
  } catch (error) {
    $("healthBadge").textContent = "Errore";
    $("healthBadge").className = "badge bad";
    $("diagnostics").innerHTML = '<div class="item"><span class="item-title">' + esc(error.message) + '</span></div>';
  } finally {
    $("refreshButton").disabled = false;
  }
}

$("refreshButton").addEventListener("click", load);
$("applyButton").addEventListener("click", async () => {
  const dialog = $("confirmDialog");
  dialog.showModal();
  const result = await new Promise((resolve) => {
    dialog.addEventListener("close", () => resolve(dialog.returnValue), { once: true });
  });
  if (result !== "confirm" || !state) return;

  $("applyButton").disabled = true;
  try {
    const response = await fetch("/api/apply", {
      method: "POST",
      headers: { "x-armonia-token": state.csrfToken }
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Applicazione non riuscita.");
    await load();
  } catch (error) {
    alert(error.message);
    await load();
  }
});

load();

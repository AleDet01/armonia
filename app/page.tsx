import { PortfolioExplorer } from "./portfolio-explorer";
import snapshot from "../portfolio/snapshot.json";

const totalClaims = snapshot.repositories.reduce(
  (sum, repository) => sum + repository.claims,
  0,
);
const contradictions = snapshot.repositories.reduce(
  (sum, repository) => sum + repository.contradictions,
  0,
);
const availableRepositories = snapshot.repositories.filter(
  (repository) => repository.available,
).length;

export default function Home() {
  return (
    <main>
      <nav className="nav shell" aria-label="Primary navigation">
        <a className="brand" href="#top" aria-label="Armonia home">
          <img className="brand-logo" src="/armonia-mark.svg" alt="" aria-hidden="true" />
          <span>armonia</span>
        </a>
        <div className="nav-links">
          <a href="#engine">Engine</a>
          <a href="#ecosystem">Ecosystem</a>
          <a href="#principles">Principles</a>
        </div>
        <a className="nav-cta" href="#quickstart">
          Run a scan <span aria-hidden="true">↗</span>
        </a>
      </nav>

      <section className="hero shell" id="top">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="pulse-dot" aria-hidden="true" />
            Open source · local first · deterministic
          </div>
          <h1>
            Make every repository
            <span>tell the same truth.</span>
          </h1>
          <p className="hero-lead">
            Armonia turns the promises scattered across code, READMEs, CI,
            containers and environment files into one verifiable evidence graph.
            When two sources disagree, you see both—not a vague warning.
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href="#quickstart">
              Scan your repository
              <span aria-hidden="true">→</span>
            </a>
            <a className="button button-quiet" href="#ecosystem">
              Explore the system
            </a>
          </div>
          <dl className="hero-stats" aria-label="Current ecosystem snapshot">
            <div>
              <dt>{availableRepositories}</dt>
              <dd>local repositories mapped</dd>
            </div>
            <div>
              <dt>{totalClaims}</dt>
              <dd>machine-checkable claims</dd>
            </div>
            <div>
              <dt>{contradictions}</dt>
              <dd>contradictions surfaced</dd>
            </div>
          </dl>
        </div>

        <div className="hero-visual" aria-label="Example Armonia evidence graph">
          <div className="scan-window">
            <div className="window-bar">
              <span className="window-title">armonia scan</span>
              <span className="window-state">live evidence</span>
            </div>
            <div className="score-panel">
              <div className="score-orbit" aria-label="Harmony score 92">
                <span>92</span>
                <small>harmony</small>
              </div>
              <div className="score-copy">
                <span className="muted-label">Repository state</span>
                <strong>Healthy, with 2 conflicts</strong>
                <p>137 claims reconciled across 24 sources</p>
              </div>
            </div>
            <div className="evidence-flow">
              <div className="source-card">
                <span>package.json · 9</span>
                <code>&quot;node&quot;: &quot;&gt;=22&quot;</code>
              </div>
              <div className="conflict-node" aria-hidden="true">
                ≠
              </div>
              <div className="source-card source-card-warn">
                <span>deploy.yml · 31</span>
                <code>node-version: 20</code>
              </div>
            </div>
            <div className="finding-row">
              <span className="severity-pill">runtime/drift</span>
              <div>
                <strong>Node runtime disagrees across sources</strong>
                <p>Fix either declaration; Armonia never guesses the winner.</p>
              </div>
              <span className="finding-key">E2</span>
            </div>
            <div className="terminal-line">
              <span aria-hidden="true">›</span>
                  <code>node bin/armonia.mjs scan . --format sarif</code>
              <span className="cursor" aria-hidden="true" />
            </div>
          </div>
          <div className="orbit-label orbit-label-a">README</div>
          <div className="orbit-label orbit-label-b">CI</div>
          <div className="orbit-label orbit-label-c">ENV</div>
        </div>
      </section>

      <section className="problem-band" id="engine">
        <div className="shell problem-grid">
          <div>
            <span className="section-index">01 / The gap</span>
            <h2>Repositories already contain the truth. Just not in one place.</h2>
          </div>
          <div className="problem-copy">
            <p>
              A README says Node 22. CI runs Node 20. Docker exposes 3000 while
              the example says 8080. A new environment variable exists in code
              but nowhere else. Every file is valid; the repository is still
              wrong.
            </p>
            <p>
              Linters validate files. Armonia validates the relationships
              between them.
            </p>
          </div>
        </div>
      </section>

      <section className="engine-section shell">
        <div className="section-heading">
          <span className="section-index">02 / Evidence engine</span>
          <h2>One scan. Three layers of confidence.</h2>
          <p>
            No account, cloud upload or model key. The same facts produce the
            same report on a laptop, in CI and across an ecosystem.
          </p>
        </div>
        <div className="feature-grid">
          <article className="feature-card feature-card-wide">
            <span className="feature-number">01</span>
            <div className="feature-glyph claim-glyph" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <h3>Collect claims</h3>
            <p>
              Extract runtime versions, commands, variables, paths, ports and
              public-project guarantees from the files developers already use.
            </p>
            <div className="tag-row">
              <span>README</span><span>manifests</span><span>workflows</span>
              <span>Docker</span><span>source</span>
            </div>
          </article>
          <article className="feature-card">
            <span className="feature-number">02</span>
            <div className="feature-glyph reconcile-glyph" aria-hidden="true">
              <span>A</span><i /><span>B</span>
            </div>
            <h3>Reconcile meaning</h3>
            <p>
              Compare claims by intent, not file type. Each contradiction keeps
              precise source locations and a stable fingerprint.
            </p>
          </article>
          <article className="feature-card feature-card-dark">
            <span className="feature-number">03</span>
            <div className="feature-glyph ship-glyph" aria-hidden="true">✓</div>
            <h3>Ship proof</h3>
            <p>
              Human terminal output, automation-friendly JSON and native SARIF
              annotations from the same deterministic report.
            </p>
          </article>
        </div>
      </section>

      <PortfolioExplorer repositories={snapshot.repositories} />

      <section className="principles-section" id="principles">
        <div className="shell">
          <div className="section-heading section-heading-light">
            <span className="section-index">04 / Design contract</span>
            <h2>Useful because it refuses to bluff.</h2>
          </div>
          <div className="principles-grid">
            <article>
              <span>Evidence over opinion</span>
              <h3>Every conflict is inspectable.</h3>
              <p>
                A finding links back to the claims that produced it. Missing
                context lowers confidence instead of manufacturing certainty.
              </p>
            </article>
            <article>
              <span>Local by default</span>
              <h3>Your code stays yours.</h3>
              <p>
                The core has zero runtime dependencies and performs no network
                requests. Reports are portable files you control.
              </p>
            </article>
            <article>
              <span>Progressive adoption</span>
              <h3>Value before configuration.</h3>
              <p>
                Start with discovery, add explicit contracts later, and only
                fail CI at the severity threshold your team chooses.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="quickstart shell" id="quickstart">
        <div className="quickstart-copy">
          <span className="section-index">05 / Start here</span>
          <h2>Your repository can explain itself in under a minute.</h2>
          <p>
            Run the zero-config scan, inspect the evidence, then commit an
            Armonia contract only when you need custom rules or an ecosystem map.
          </p>
        </div>
        <div className="command-card">
          <div>
            <span className="command-label">01 · inspect</span>
            <code><b>$</b> npm run scan</code>
          </div>
          <div>
            <span className="command-label">02 · adopt</span>
            <code><b>$</b> node bin/armonia.mjs init .</code>
          </div>
          <div>
            <span className="command-label">03 · connect</span>
            <code><b>$</b> npm run portfolio:example</code>
          </div>
        </div>
      </section>

      <footer className="footer shell">
        <a className="brand" href="#top">
          <img className="brand-logo brand-logo-small" src="/armonia-mark.svg" alt="" aria-hidden="true" />
          <span>armonia</span>
        </a>
        <p>Repository truth, reconciled in public.</p>
        <span>MIT licensed · built for maintainers</span>
      </footer>
    </main>
  );
}

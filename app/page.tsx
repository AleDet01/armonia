import { RepositoryScanner } from "./repository-scanner";

const signals = [
  {
    number: "01",
    tone: "collect",
    title: "Read the signals",
    body: "README, manifests, CI, Docker and source—without running repository code.",
  },
  {
    number: "02",
    tone: "compare",
    title: "Expose the drift",
    body: "Match related declarations and keep both source locations in view.",
  },
  {
    number: "03",
    tone: "report",
    title: "Keep the evidence",
    body: "Terminal, JSON or SARIF output for a review or CI gate.",
  },
] as const;

export default function Home() {
  return (
    <main>
      <nav className="nav shell" aria-label="Primary navigation">
        <a className="brand" href="#top" aria-label="Armonia home">
          <img className="brand-logo" src="armonia-mark.svg" alt="" aria-hidden="true" />
          <span>armonia</span>
        </a>
        <div className="nav-links">
          <a href="#engine">How it works</a>
          <a href="#scan">Try it</a>
        </div>
        <a className="nav-cta" href="#scan">
          Scan locally <span aria-hidden="true">↗</span>
        </a>
      </nav>

      <section className="hero shell" id="top">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="pulse-dot" aria-hidden="true" />
            Local-first repository checks
          </div>
          <h1>
            Find drift
            <span>before it ships.</span>
          </h1>
          <p className="hero-lead">
            Armonia reconciles the promises across your repository and shows
            the exact files that disagree.
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href="#scan">
              Try it in browser <span aria-hidden="true">→</span>
            </a>
            <a className="button button-quiet" href="#quickstart">
              Run the CLI
            </a>
          </div>
          <p className="hero-proof">No account · No upload · No code execution</p>
        </div>

        <div className="hero-signal" aria-label="Animated repository consistency signal">
          <div className="hero-signal-topline">
            <span>live consistency field</span>
            <span>local / deterministic</span>
          </div>
          <div className="hero-shader" aria-hidden="true">
            <span className="shader-orb shader-orb-a" />
            <span className="shader-orb shader-orb-b" />
            <span className="shader-orb shader-orb-c" />
            <i />
          </div>
          <div className="hero-signal-summary">
            <strong>Conflicts stay visible.</strong>
            <span>Every finding retains the evidence that produced it.</span>
          </div>
        </div>
      </section>

      <section className="signal-section shell" id="engine" aria-labelledby="engine-title">
        <div className="signal-heading">
          <span className="section-index">How it works</span>
          <h2 id="engine-title">Three signals. One evidence trail.</h2>
          <p>Small surface area, deterministic output, ready for a local check or CI.</p>
        </div>
        <div className="signal-grid">
          {signals.map((signal) => (
            <article className={`signal-card signal-card-${signal.tone}`} key={signal.number}>
              <div className={`signal-shader signal-shader-${signal.tone}`} aria-hidden="true">
                <span />
                <i />
                <b />
              </div>
              <div className="signal-copy">
                <span className="feature-number">{signal.number}</span>
                <h3>{signal.title}</h3>
                <p>{signal.body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <RepositoryScanner />

      <section className="command-strip shell" id="quickstart" aria-label="Command line quick start">
        <div>
          <span className="section-index">For CI and repeatable checks</span>
          <strong>Use the same engine from the terminal.</strong>
        </div>
        <code><b>$</b> node bin/armonia.mjs scan . --format sarif</code>
      </section>

      <footer className="footer shell">
        <a className="brand" href="#top">
          <img className="brand-logo brand-logo-small" src="armonia-mark.svg" alt="" aria-hidden="true" />
          <span>armonia</span>
        </a>
        <p>Repository consistency checks.</p>
        <span>MIT licensed</span>
      </footer>
    </main>
  );
}

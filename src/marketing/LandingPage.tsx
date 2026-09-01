import { useEffect } from "react";
import {
  ArrowRight,
  Check,
  ChevronRight,
  CircleAlert,
  Download,
  ExternalLink,
  Monitor,
  Network,
  Radio,
  SearchCheck,
  ShieldCheck,
  Sparkles,
  Wifi,
  Wrench
} from "lucide-react";
import "./landing.css";

const releaseUrl = "https://github.com/Charlemagne404/Aegis-Trace/releases";

const timelineStages = [
  { label: "Device", Icon: Monitor, state: "pass" },
  { label: "Adapter", Icon: Network, state: "pass" },
  { label: "Wi-Fi", Icon: Wifi, state: "pass" },
  { label: "IP Address", Icon: Radio, state: "pass" },
  { label: "Gateway", Icon: Network, state: "pass" },
  { label: "Internet", Icon: Sparkles, state: "pass" },
  { label: "DNS", Icon: SearchCheck, state: "issue" },
  { label: "Apps", Icon: Monitor, state: "muted" }
];

const principles = [
  {
    number: "01",
    title: "See the whole path",
    body: "A single visual chain follows the connection from your device to the apps that need it. The break is easy to spot."
  },
  {
    number: "02",
    title: "Understand the why",
    body: "Plain-language explanations turn raw symptoms into a diagnosis, with the evidence there when you need it."
  },
  {
    number: "03",
    title: "Fix with confidence",
    body: "Each repair is scoped, explained, and shown before it runs. Nothing resets itself in the background."
  }
];

export function LandingPage() {
  useEffect(() => {
    document.documentElement.classList.add("landing-document");
    document.body.classList.add("landing-document");
    document.title = "Aegis Trace — Know where your connection breaks";

    return () => {
      document.documentElement.classList.remove("landing-document");
      document.body.classList.remove("landing-document");
    };
  }, []);

  return (
    <main className="landing-page">
      <div className="landing-orb landing-orb-one" />
      <div className="landing-orb landing-orb-two" />

      <nav className="landing-nav" aria-label="Primary navigation">
        <a className="landing-brand" href="#top" aria-label="Aegis Trace home">
          <span className="brand-mark"><ShieldCheck aria-hidden="true" /></span>
          <span>Aegis <em>Trace</em></span>
        </a>
        <div className="landing-nav-links">
          <a href="#how-it-works">How it works</a>
          <a href="#safety">Safety</a>
          <a href="#download">Download</a>
        </div>
        <a className="nav-download" href={releaseUrl} target="_blank" rel="noreferrer">
          Download <Download aria-hidden="true" />
        </a>
      </nav>

      <section className="landing-hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow"><span /> Network clarity, without the guesswork</p>
          <h1>Know where your<br /><i>connection</i> breaks.</h1>
          <p className="hero-lede">
            Aegis Trace turns a frustrating network problem into a calm, visual diagnosis — then helps you take the safest next step.
          </p>
          <div className="hero-actions">
            <a className="button-primary" href={releaseUrl} target="_blank" rel="noreferrer">
              Download for Windows, macOS, or Linux <ArrowRight aria-hidden="true" />
            </a>
            <a className="button-quiet" href="#how-it-works">
              See how it works <ChevronRight aria-hidden="true" />
            </a>
          </div>
          <p className="hero-note"><Check aria-hidden="true" /> Windows, macOS, and Linux · Private by design</p>
        </div>

        <div className="product-stage" aria-label="Aegis Trace diagnostic timeline preview">
          <div className="product-glow" />
          <div className="product-window">
            <div className="window-topbar">
              <div className="window-brand"><span><ShieldCheck /></span> Aegis Trace</div>
              <div className="window-controls"><b /><b /><b /></div>
            </div>
            <div className="window-content">
              <aside className="window-sidebar" aria-hidden="true">
                <span className="sidebar-selected" /><span /><span /><span /><span />
              </aside>
              <div className="diagnostic-view">
                <div className="view-heading">
                  <div>
                    <p>DIAGNOSTIC OVERVIEW</p>
                    <h2>Connection path</h2>
                  </div>
                  <span className="scan-chip"><i /> Scan complete</span>
                </div>
                <div className="path-card">
                  <div className="path-label"><ActivityGlyph /> 7 of 8 stages checked <small>DNS needs attention</small></div>
                  <div className="stage-flow">
                    {timelineStages.map(({ label, Icon, state }, index) => (
                      <div className={`stage-item ${state}`} key={label}>
                        <div className="stage-dot"><Icon aria-hidden="true" /></div>
                        <span>{label}</span>
                        {index < timelineStages.length - 1 ? <i className="stage-line" /> : null}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="finding-card">
                  <div className="finding-icon"><CircleAlert aria-hidden="true" /></div>
                  <div><p>Primary finding</p><h3>DNS is not resolving</h3><span>Your device can reach the internet, but names like websites cannot be found.</span></div>
                  <span className="confidence">High confidence</span>
                </div>
                <div className="repair-row">
                  <div><p>Recommended next step</p><b>Flush DNS cache</b></div>
                  <button type="button">Review repair <ArrowRight aria-hidden="true" /></button>
                </div>
              </div>
            </div>
          </div>
          <div className="floating-proof"><span><Check /></span><div><b>Evidence-backed</b><small>Not a blind reset</small></div></div>
        </div>
      </section>

      <section className="trust-strip" aria-label="Product benefits">
        <p><ShieldCheck /> No telemetry</p><span />
        <p><SearchCheck /> Evidence before repair</p><span />
        <p><Wrench /> Safe, allowlisted fixes</p><span />
        <p><Monitor /> Built for Windows, macOS, and Linux</p>
      </section>

      <section className="principles-section" id="how-it-works">
        <div className="section-intro">
          <p className="eyebrow"><span /> A better way to troubleshoot</p>
          <h2>From “the internet is broken”<br />to a useful answer.</h2>
        </div>
        <div className="principle-grid">
          {principles.map((principle) => (
            <article className="principle" key={principle.number}>
              <span>{principle.number}</span>
              <h3>{principle.title}</h3>
              <p>{principle.body}</p>
              <ArrowRight aria-hidden="true" />
            </article>
          ))}
        </div>
      </section>

      <section className="safety-section" id="safety">
        <div className="safety-card">
          <div className="safety-orbit" aria-hidden="true"><ShieldCheck /></div>
          <div className="safety-copy">
            <p className="eyebrow"><span /> Thoughtful by default</p>
            <h2>Your network deserves<br />a careful <i>diagnosis.</i></h2>
            <p>Aegis Trace starts with observation, not disruption. It explains the evidence, recommends the least invasive repair, and always keeps you in control.</p>
          </div>
          <ul>
            <li><Check /> No arbitrary command execution</li>
            <li><Check /> Command previews before changes</li>
            <li><Check /> Nothing leaves your device</li>
            <li><Check /> Stronger repairs need confirmation</li>
          </ul>
        </div>
      </section>

      <section className="download-section" id="download">
        <div className="download-grid" />
        <p className="eyebrow"><span /> Ready when you are</p>
        <h2>Make the next network<br />problem easier to understand.</h2>
        <p>Get Aegis Trace for Windows, macOS, or Linux and replace vague error messages with a clear path forward.</p>
        <a className="button-primary" href={releaseUrl} target="_blank" rel="noreferrer">
          Download for Windows, macOS, or Linux <Download aria-hidden="true" />
        </a>
        <small>Opens the Aegis Trace release page on GitHub <ExternalLink aria-hidden="true" /></small>
      </section>

      <footer className="landing-footer">
        <a className="landing-brand" href="#top"><span className="brand-mark"><ShieldCheck aria-hidden="true" /></span><span>Aegis <em>Trace</em></span></a>
        <p>Visual network diagnostics for Windows, macOS, and Linux.</p>
        <a href="https://github.com/Charlemagne404/Aegis-Trace" target="_blank" rel="noreferrer">GitHub <ExternalLink aria-hidden="true" /></a>
      </footer>
    </main>
  );
}

function ActivityGlyph() {
  return <span className="activity-glyph" aria-hidden="true"><i /><i /><i /></span>;
}

"use client";

import { useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  Clipboard,
  CloudCog,
  Copy,
  ExternalLink,
  KeyRound,
  LoaderCircle,
  Radio,
  ShieldCheck,
  TerminalSquare,
} from "lucide-react";
import type { LicensedProduct } from "@/types/db";

const operations = [
  { label: "Activate", path: "/licenses/activate", method: "POST" },
  { label: "Validate", path: "/licenses/validate", method: "POST" },
  { label: "Heartbeat", path: "/licenses/heartbeat", method: "POST" },
  { label: "Deactivate", path: "/licenses/deactivate", method: "POST" },
];

export function ApiConnectionPanel({ products, onClose }: { products: LicensedProduct[]; onClose: () => void }) {
  const projectUrl = typeof window === "undefined" ? "" : window.location.origin;
  const apiBase = `${projectUrl}/api/license/v1`;
  const [productId, setProductId] = useState(products.find((product) => product.active)?.id ?? products[0]?.id ?? "");
  const [copied, setCopied] = useState("");
  const [checking, setChecking] = useState(false);
  const [connection, setConnection] = useState<"idle" | "ready" | "unavailable">("idle");
  const product = products.find((candidate) => candidate.id === productId);

  const snippet = useMemo(() => `const response = await fetch("${apiBase}/licenses/activate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    license_key: "CUSTOMER_LICENSE_KEY",
    product_code: "${product?.code ?? "your-product-code"}",
    installation_id: crypto.randomUUID(),
    application_version: "1.0.0",
    platform: "windows"
  })
});

const license = await response.json();`, [apiBase, product?.code]);

  async function copy(value: string, id: string) {
    await navigator.clipboard.writeText(value);
    setCopied(id);
    window.setTimeout(() => setCopied((current) => current === id ? "" : current), 1800);
  }

  async function testConnection() {
    if (!projectUrl) return setConnection("unavailable");
    setChecking(true);
    setConnection("idle");
    try {
      const response = await fetch(`${apiBase}/.well-known/jwks.json`, { cache: "no-store" });
      const body = await response.json() as { keys?: unknown[] };
      setConnection(response.ok && Array.isArray(body.keys) && body.keys.length > 0 ? "ready" : "unavailable");
    } catch {
      setConnection("unavailable");
    } finally {
      setChecking(false);
    }
  }

  return (
    <section className="api-connection-panel" aria-labelledby="api-connection-title">
      <header className="api-connection-header">
        <span className="api-connection-symbol"><CloudCog size={20} /></span>
        <div><p className="eyebrow">Application gateway</p><h2 id="api-connection-title">Connect another application</h2><p>Copy the public endpoint and product identity. Customer license keys are entered during activation.</p></div>
        <button className="api-panel-close" onClick={onClose}>Hide setup <ChevronDown size={14} /></button>
      </header>

      <div className="api-connection-body">
        <section className="api-address-card">
          <div className="api-address-heading"><span><Radio size={15} /></span><div><small>Licensing API base</small><strong className={`api-connection-state state-${connection}`}>{connection === "ready" ? "Live" : connection === "unavailable" ? "Not reachable" : "Not tested"}</strong></div></div>
          <div className="api-copy-field"><code>{apiBase}</code><button onClick={() => void copy(apiBase, "base")} disabled={!projectUrl} aria-label="Copy API base URL">{copied === "base" ? <Check size={14} /> : <Copy size={14} />}{copied === "base" ? "Copied" : "Copy"}</button></div>
          <div className="api-address-actions"><button className="button button-secondary" onClick={() => void testConnection()} disabled={checking || !projectUrl}>{checking ? <LoaderCircle className="spin-icon" size={14} /> : <Radio size={14} />} Test connection</button>{projectUrl && <a className="button button-secondary" href={`${apiBase}/.well-known/jwks.json`} target="_blank" rel="noreferrer">Public signing keys <ExternalLink size={13} /></a>}</div>
          {connection === "unavailable" && <p className="api-connection-help">Apply the licensing SQL, configure signing secrets, and deploy the <code>license-api</code> Edge Function.</p>}
        </section>

        <section className="api-product-card">
          <div className="section-heading"><div><p className="eyebrow">Application identity</p><h3>Choose the product</h3></div><KeyRound size={15} /></div>
          {products.length ? <><label className="field"><span>Registered product</span><select value={productId} onChange={(event) => setProductId(event.target.value)}>{products.map((item) => <option value={item.id} key={item.id}>{item.name}{item.active ? "" : " (disabled)"}</option>)}</select></label><div className="api-product-code"><div><small>Product code</small><code>{product?.code}</code></div><button onClick={() => void copy(product?.code ?? "", "product")} aria-label="Copy product code">{copied === "product" ? <Check size={14} /> : <Clipboard size={14} />}{copied === "product" ? "Copied" : "Copy code"}</button></div><div className="api-policy-line"><span><strong>{product?.default_max_activations}</strong><small>default activations</small></span><span><strong>{product?.default_validation_hours}h</strong><small>validation interval</small></span><span><strong>{product?.default_offline_grace_days}d</strong><small>offline grace</small></span></div></> : <div className="contact-ledger-empty"><KeyRound size={17} /><div><strong>Add a product first</strong><p>A product code identifies which application is requesting activation.</p></div></div>}
        </section>
      </div>

      <div className="api-endpoint-grid" aria-label="Licensing API endpoints">
        {operations.map((operation) => { const url = `${apiBase}${operation.path}`; return <article key={operation.path}><span>{operation.method}</span><div><strong>{operation.label}</strong><code>{operation.path}</code></div><button onClick={() => void copy(url, operation.path)} disabled={!projectUrl} aria-label={`Copy ${operation.label} endpoint`}>{copied === operation.path ? <Check size={14} /> : <Copy size={14} />}</button></article>; })}
      </div>

      <section className="api-snippet-card">
        <header><span><TerminalSquare size={15} /></span><div><small>Ready-to-use example</small><strong>Activation request</strong></div><button onClick={() => void copy(snippet, "snippet")} disabled={!projectUrl}>{copied === "snippet" ? <Check size={14} /> : <Copy size={14} />}{copied === "snippet" ? "Copied" : "Copy code"}</button></header>
        <pre><code>{snippet}</code></pre>
      </section>

      <footer className="api-security-note"><ShieldCheck size={15} /><div><strong>No private API key belongs in the application.</strong><span>The customer license key activates the installation. The API returns a signed token for later validation.</span></div></footer>
    </section>
  );
}

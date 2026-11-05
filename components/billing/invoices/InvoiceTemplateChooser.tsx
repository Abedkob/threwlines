import Link from "next/link";
import { Check, LayoutTemplate, Plus } from "lucide-react";
import type { CSSProperties } from "react";
import { isWaveBackground } from "@/lib/template-background";
import type { DocumentTemplate } from "@/types/db";

export function InvoiceTemplateChooser({
  templates,
  value,
  onChange,
}: {
  templates: DocumentTemplate[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <fieldset className="invoice-template-chooser span-2">
      <legend>Invoice design</legend>
      <div className="invoice-template-heading">
        <span><LayoutTemplate size={15} /></span>
        <div><strong>Choose a template</strong><small>The selected design is saved with this invoice.</small></div>
        <Link href="/templates" target="_blank">Manage templates</Link>
      </div>

      {templates.length ? (
        <div className="invoice-template-options">
          {templates.map((template) => {
            const selected = value === template.id;
            const wave = isWaveBackground(template.config.backgroundStyle);
            return (
              <button
                type="button"
                className={`invoice-template-option${selected ? " selected" : ""}`}
                aria-pressed={selected}
                onClick={() => onChange(template.id)}
                key={template.id}
              >
                <span
                  className={`invoice-template-paper${wave ? " wave" : ""}`}
                  style={{ "--template-accent": template.config.primaryColor } as CSSProperties}
                  aria-hidden="true"
                ><i /><b /><em /></span>
                <span className="invoice-template-copy">
                  <strong>{template.name}</strong>
                  <small>{template.config.orientation} · {wave ? "Brand wave" : "Clean"}</small>
                  {template.is_default && <em>Default</em>}
                </span>
                <span className="invoice-template-check"><Check size={12} /></span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="invoice-template-empty"><LayoutTemplate size={17} /><span><strong>No invoice templates</strong><small>Create a design before issuing this invoice.</small></span><Link href="/templates" target="_blank"><Plus size={12} /> Create template</Link></div>
      )}
    </fieldset>
  );
}

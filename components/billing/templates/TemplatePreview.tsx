import { Eye } from "lucide-react";
import { DocumentWave } from "@/components/billing/shared/DocumentWave";
import type { AppSettings, DocumentType, TemplateConfig } from "@/types/db";

type Props = {
  config: TemplateConfig;
  documentType: DocumentType;
  templateName: string;
  appSettings: AppSettings | null;
  logoUrl: string | null;
};

export function TemplatePreview({ config, documentType, templateName, appSettings, logoUrl }: Props) {
  const backgroundStyle = config.backgroundStyle ?? "clean";
  const companyName = appSettings?.company_name?.trim() || "Company name";
  const companyTagline = appSettings?.company_tagline?.trim() || "Company profile";
  const companyWebsite = appSettings?.company_website?.trim() || "Website not configured";
  const previewLogoWidth = Math.min(Math.max(config.logoWidth * 0.34, 42), 92);

  return (
    <aside className="template-preview-panel" aria-label="Live template preview">
      <header className="template-preview-toolbar">
        <span className="template-preview-live">
          <i />
          <Eye size={13} />
          Live preview
        </span>
        <span>{config.paperSize} · {config.orientation}</span>
      </header>

      <div
        className={`template-preview template-preview-${backgroundStyle}`}
        style={{
          "--invoice-color": config.primaryColor,
          "--invoice-font": config.fontFamily,
        } as React.CSSProperties}
      >
        {backgroundStyle === "idevelopit-wave" && (
          <DocumentWave className="template-preview-wave-art" />
        )}

        <div className="preview-registration-line">
          <span>THREWLINES / DOCUMENT SYSTEM</span>
          <span>{documentType.toUpperCase()} — 01</span>
        </div>

        <div className="preview-head">
          <div className="preview-brand-lockup">
            {logoUrl ? (
              <img
                className="preview-logo-image"
                src={logoUrl}
                alt={`${companyName} logo`}
                style={{ width: previewLogoWidth }}
              />
            ) : (
              <span className="preview-logo-empty" style={{ width: previewLogoWidth }}>Logo not configured</span>
            )}
            <span>{companyName}<br /><small>{companyTagline}</small></span>
          </div>
          <div className="preview-document-id">
            <small>Billing document</small>
            <strong>{config.labels.invoiceTitle}</strong>
            <span>INV-2026-018</span>
          </div>
        </div>

        <section className="preview-client-card">
          <span className="preview-section-number">01</span>
          <div>
            <p className="invoice-label">{config.labels.billTo}</p>
            <h3>Northstar Commerce</h3>
            <small>Beirut, Lebanon · accounts@northstar.co</small>
          </div>
        </section>

        <div className="preview-meta-row">
          <span><small>Invoice date</small><strong>04 Aug 2026</strong></span>
          <span><small>Due date</small><strong>18 Aug 2026</strong></span>
          <span><small>Currency</small><strong>USD</strong></span>
        </div>

        <section className="preview-services">
          <div className="preview-section-heading">
            <span className="preview-section-number">02</span>
            <p className="invoice-label">{config.labels.services}</p>
          </div>
          <div className="preview-table-head"><span>Service</span><span>Amount</span></div>
          <div className="preview-service-row"><span>Product strategy &amp; UX</span><strong>$900.00</strong></div>
          <div className="preview-service-row"><span>Interface design</span><strong>$1,500.00</strong></div>
        </section>

        <div className="preview-total">
          <span>{config.labels.totalDue}<small>Due 18 Aug 2026</small></span>
          <strong>$2,250.00</strong>
        </div>

        <footer className="preview-footer">
          <span>{companyWebsite}</span>
          <span>{templateName || "Untitled template"}</span>
        </footer>
      </div>
    </aside>
  );
}

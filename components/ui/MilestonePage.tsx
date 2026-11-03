import { ArrowUpRight } from "lucide-react";

export function MilestonePage({ section }: { section: string }) {
  return (
    <section className="milestone-card">
      <div className="milestone-index">02</div>
      <div>
        <p className="eyebrow">Shell review</p>
        <h2>{section} is queued for the next build pass.</h2>
        <p>
          The authenticated application shell is ready. This surface will be
          connected to the local database after the visual checkpoint requested in the
          brief.
        </p>
      </div>
      <ArrowUpRight className="milestone-arrow" aria-hidden="true" />
    </section>
  );
}

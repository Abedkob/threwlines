"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Activity as ActivityIcon,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Columns3,
  MapPin,
  Search,
  UserRound,
  X,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ContactDrawer } from "@/components/contacts/ContactDrawer";
import { HeatChip } from "@/components/contacts/HeatChip";
import { apiFetch, buildQuery } from "@/lib/api/client";
import type { PipelineResult } from "@/lib/db/contacts";
import { initials, relDate } from "@/lib/format";
import { contactHeat } from "@/lib/heat";
import {
  parsePipelineActivity,
  parsePipelineOwner,
  parsePipelinePage,
} from "@/lib/pipeline";
import type { Contact, ContactStage, Profile } from "@/types/db";

const PAGE_SIZE = 40;
const columns: { stage: ContactStage; label: string; cue: string }[] = [
  { stage: "new", label: "New", cue: "Not approached" },
  { stage: "contacted", label: "Contacted", cue: "Waiting for signal" },
  { stage: "replied", label: "Replied", cue: "Conversation open" },
  { stage: "negotiating", label: "Negotiating", cue: "Decision in motion" },
  { stage: "customer", label: "Customer", cue: "Work won" },
  { stage: "lost", label: "Lost", cue: "Closed for now" },
];
const stages = columns.map((column) => column.stage);
const stageRecord = <T,>(value: () => T): Record<ContactStage, T> => ({
  new: value(),
  contacted: value(),
  replied: value(),
  negotiating: value(),
  customer: value(),
  lost: value(),
});
const emptyRows = () => stageRecord<Contact[]>(() => []);
const emptyTotals = () => stageRecord(() => 0);
const firstPages = () => stageRecord(() => 1);
const pageParam = (stage: ContactStage) => `page_${stage}`;

export function PipelineClient() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const query = searchParams.get("q")?.trim() ?? "";
  const owner = parsePipelineOwner(searchParams.get("owner"));
  const activity = parsePipelineActivity(searchParams.get("activity"));
  const pages = useMemo(
    () =>
      Object.fromEntries(
        stages.map((stage) => [
          stage,
          parsePipelinePage(searchParams.get(pageParam(stage))),
        ]),
      ) as Record<ContactStage, number>,
    [searchParams],
  );

  const [grouped, setGrouped] =
    useState<Record<ContactStage, Contact[]>>(emptyRows);
  const [totals, setTotals] =
    useState<Record<ContactStage, number>>(emptyTotals);
  const [totalPages, setTotalPages] =
    useState<Record<ContactStage, number>>(firstPages);
  const [mobileStage, setMobileStage] = useState<ContactStage>("new");
  const [mobileStageChosen, setMobileStageChosen] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<Contact | null>(null);
  const [searchDraft, setSearchDraft] = useState(query);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState("");
  const loadRequest = useRef(0);

  const replaceParams = useCallback(
    (changes: Record<string, string | number | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(changes).forEach(([key, value]) => {
        if (
          value === null ||
          value === "" ||
          (key === "owner" && value === "all") ||
          (key === "activity" && value === "all") ||
          (key.startsWith("page_") && Number(value) === 1)
        )
          params.delete(key);
        else params.set(key, String(value));
      });
      router.replace(`${pathname}${params.size ? `?${params}` : ""}`, {
        scroll: false,
      });
    },
    [pathname, router, searchParams],
  );

  const resetPageChanges = useCallback(
    () =>
      Object.fromEntries(stages.map((stage) => [pageParam(stage), 1])) as Record<
        string,
        number
      >,
    [],
  );

  const changeFilters = useCallback(
    (changes: Record<string, string | number | null>) =>
      replaceParams({ ...changes, ...resetPageChanges() }),
    [replaceParams, resetPageChanges],
  );

  const load = useCallback(async () => {
    const requestId = ++loadRequest.current;
    setFetching(true);
    setError("");
    try {
      const pipeline = await apiFetch<PipelineResult>(
        `/api/contacts/pipeline${buildQuery({
          query,
          owner,
          activity,
          pageSize: PAGE_SIZE,
          ...pages,
        })}`,
      );
      if (requestId !== loadRequest.current) return;
      setGrouped(pipeline.rows);
      setTotals(pipeline.totals);
      setTotalPages(pipeline.totalPages);

      const corrections: Record<string, number> = {};
      stages.forEach((stage) => {
        if (pages[stage] > pipeline.totalPages[stage])
          corrections[pageParam(stage)] = pipeline.totalPages[stage];
      });
      if (Object.keys(corrections).length) replaceParams(corrections);
    } catch (caught) {
      if (requestId !== loadRequest.current) return;
      setError(
        caught instanceof Error
          ? caught.message
          : "Pipeline could not be loaded.",
      );
    } finally {
      if (requestId === loadRequest.current) {
        setLoading(false);
        setFetching(false);
      }
    }
  }, [activity, owner, pages, query, replaceParams]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    void apiFetch<Profile[]>("/api/profiles")
      .then(setProfiles)
      .catch((caught) =>
        setError(
          caught instanceof Error
            ? caught.message
            : "Owner options could not be loaded.",
        ),
      );
  }, []);
  useEffect(() => setSearchDraft(query), [query]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const nextQuery = searchDraft.trim();
      if (nextQuery !== query) changeFilters({ q: nextQuery });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [changeFilters, query, searchDraft]);
  useEffect(() => {
    if (mobileStageChosen || totals[mobileStage] > 0) return;
    const firstPopulated = stages.find((stage) => totals[stage] > 0);
    if (firstPopulated) setMobileStage(firstPopulated);
  }, [mobileStage, mobileStageChosen, totals]);

  async function refreshContact(id: string) {
    setSelected(await apiFetch<Contact>(`/api/contacts/${id}`));
    await load();
  }

  function keyOpen(event: React.KeyboardEvent, contact: Contact) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setSelected(contact);
    }
  }

  function clearFilters() {
    setSearchDraft("");
    changeFilters({ q: null, owner: "all", activity: "all" });
  }

  const activeTotal =
    totals.new + totals.contacted + totals.replied + totals.negotiating;
  const matchingTotal = stages.reduce((sum, stage) => sum + totals[stage], 0);
  const filtersActive = Boolean(query || owner !== "all" || activity !== "all");

  if (loading)
    return (
      <div className="surface loading-state pipeline-loading">
        <span className="spinner" />
        Loading pipeline…
      </div>
    );

  return (
    <div
      className={`pipeline-view ${fetching ? "surface-fetching" : ""}`}
      aria-busy={fetching}
    >
      {error && (
        <div className="page-error" role="alert">
          {error}
          <button onClick={() => void load()}>Try again</button>
        </div>
      )}

      <section className="surface pipeline-toolbar" aria-label="Pipeline filters">
        <label className="search-box pipeline-search">
          <Search size={16} />
          <span className="sr-only">Search pipeline</span>
          <input
            aria-label="Search pipeline"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="Search name, channel, or location"
          />
        </label>
        <label className="pipeline-filter">
          <UserRound size={15} />
          <span className="sr-only">Filter by owner</span>
          <select
            aria-label="Filter pipeline by owner"
            value={owner}
            onChange={(event) => changeFilters({ owner: event.target.value })}
          >
            <option value="all">All owners</option>
            <option value="unassigned">Unassigned</option>
            {profiles.map((profile) => (
              <option value={profile.id} key={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>
        </label>
        <label className="pipeline-filter">
          <ActivityIcon size={15} />
          <span className="sr-only">Filter by activity</span>
          <select
            aria-label="Filter pipeline by activity"
            value={activity}
            onChange={(event) =>
              changeFilters({ activity: event.target.value })
            }
          >
            <option value="all">All activity</option>
            <option value="fresh">Fresh · 0–3 days</option>
            <option value="watch">Watch · 4–7 days</option>
            <option value="warm">Warm · 8–14 days</option>
            <option value="hot">Needs attention · 15+ days</option>
          </select>
        </label>
        {filtersActive && (
          <button
            className="pipeline-clear"
            type="button"
            onClick={clearFilters}
          >
            <X size={14} />
            Clear
          </button>
        )}
      </section>

      <div className="pipeline-summary">
        <div>
          <Columns3 size={16} />
          <span>
            {filtersActive
              ? `${matchingTotal} matching contacts · ${activeTotal} active`
              : `${activeTotal} active opportunities`}
          </span>
        </div>
        <p>40 per stage · ordered by neglect</p>
      </div>

      <div className="pipeline-stage-tabs" aria-label="Choose pipeline stage">
        {columns.map(({ stage, label }) => (
          <button
            key={stage}
            className={mobileStage === stage ? "selected" : ""}
            onClick={() => {
              setMobileStage(stage);
              setMobileStageChosen(true);
            }}
            aria-pressed={mobileStage === stage}
          >
            {label}
            <span>{totals[stage]}</span>
          </button>
        ))}
      </div>

      <section className="pipeline-board" aria-label="Sales pipeline">
        {columns.map(({ stage, label, cue }) => {
          const first = (pages[stage] - 1) * PAGE_SIZE + 1;
          const last = first + grouped[stage].length - 1;
          return (
            <div
              className={`pipeline-column pipeline-${stage} ${mobileStage === stage ? "mobile-stage-active" : ""}`}
              key={stage}
            >
              <header className="pipeline-column-header">
                <div>
                  <span className="pipeline-stage-dot" />
                  <h2>{label}</h2>
                  <strong>{totals[stage]}</strong>
                </div>
                <p>{cue}</p>
              </header>
              <div className="pipeline-cards">
                {grouped[stage].map((contact) => (
                  <article
                    className={`pipeline-card heat-edge-${contactHeat(contact)}`}
                    key={contact.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelected(contact)}
                    onKeyDown={(event) => keyOpen(event, contact)}
                    aria-label={`Open ${contact.name}`}
                  >
                    <div className="pipeline-card-top">
                      <span className="table-avatar">
                        {initials(contact.name)}
                      </span>
                      <HeatChip contact={contact} />
                    </div>
                    <h3>{contact.name}</h3>
                    <p>{contact.notes || "No shared context yet."}</p>
                    {contact.location && (
                      <span className="pipeline-location">
                        <MapPin size={12} />
                        {contact.location}
                      </span>
                    )}
                    <footer>
                      {contact.owner ? (
                        <span className="owner-cell">
                          <span
                            className="mini-avatar"
                            style={{ backgroundColor: contact.owner.color }}
                          >
                            {initials(contact.owner.name)}
                          </span>
                          {contact.owner.name}
                        </span>
                      ) : (
                        <span className="muted">Unassigned</span>
                      )}
                      <span>{relDate(contact.last_touched_at)}</span>
                      <ArrowRight size={13} />
                    </footer>
                  </article>
                ))}
                {!grouped[stage].length && (
                  <div className="pipeline-empty">
                    <span />
                    {filtersActive
                      ? "No matches in this stage"
                      : "No contacts here"}
                  </div>
                )}
              </div>
              {totals[stage] > 0 && (
                <nav
                  className="pipeline-pagination"
                  aria-label={`${label} stage pagination`}
                >
                  <span>
                    {first}–{last} of {totals[stage]}
                  </span>
                  <div>
                    <button
                      type="button"
                      onClick={() =>
                        replaceParams({
                          [pageParam(stage)]: pages[stage] - 1,
                        })
                      }
                      disabled={fetching || pages[stage] <= 1}
                      aria-label={`Previous page of ${label}`}
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <small>
                      {pages[stage]}/{totalPages[stage]}
                    </small>
                    <button
                      type="button"
                      onClick={() =>
                        replaceParams({
                          [pageParam(stage)]: pages[stage] + 1,
                        })
                      }
                      disabled={
                        fetching || pages[stage] >= totalPages[stage]
                      }
                      aria-label={`Next page of ${label}`}
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </nav>
              )}
            </div>
          );
        })}
      </section>

      {selected && (
        <ContactDrawer
          contact={selected}
          profiles={profiles}
          onClose={() => setSelected(null)}
          onChanged={refreshContact}
        />
      )}
    </div>
  );
}

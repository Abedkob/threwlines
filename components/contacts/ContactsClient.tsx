"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AtSign,
  FileUp,
  Mail,
  MessageCircle,
  Plus,
  Search,
  UsersRound,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ContactDrawer } from "@/components/contacts/ContactDrawer";
import { BulkContactsModal } from "@/components/contacts/BulkContactsModal";
import { HeatChip } from "@/components/contacts/HeatChip";
import { NewContactModal } from "@/components/contacts/NewContactModal";
import { Pagination } from "@/components/ui/Pagination";
import { apiFetch, buildQuery } from "@/lib/api/client";
import { initials } from "@/lib/format";
import { contactHeat } from "@/lib/heat";
import type { Contact, PagedResult, Profile } from "@/types/db";

type Filter = "all" | "leads" | "customers";
const emptyPage: PagedResult<Contact> = {
  rows: [],
  page: 1,
  pageSize: 25,
  total: 0,
  totalPages: 1,
};

export function ContactsClient() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = [25, 50, 100].includes(Number(searchParams.get("pageSize")))
    ? Number(searchParams.get("pageSize"))
    : 25;
  const filter = (
    ["all", "leads", "customers"].includes(searchParams.get("filter") ?? "")
      ? searchParams.get("filter")
      : "all"
  ) as Filter;
  const query = searchParams.get("q") ?? "";

  const [result, setResult] = useState<PagedResult<Contact>>(emptyPage);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<Contact | null>(null);
  const [searchDraft, setSearchDraft] = useState(query);
  const [newOpen, setNewOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState("");

  const replaceParams = useCallback(
    (changes: Record<string, string | number | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(changes).forEach(([key, value]) => {
        if (
          value === null ||
          value === "" ||
          (key === "page" && Number(value) === 1) ||
          (key === "pageSize" && Number(value) === 25) ||
          (key === "filter" && value === "all")
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

  const loadPage = useCallback(async () => {
    setFetching(true);
    setError("");
    try {
      const data = await apiFetch<PagedResult<Contact>>(
        `/api/contacts${buildQuery({ page, pageSize, query, filter })}`,
      );
      setResult(data);
      if (page > data.totalPages) replaceParams({ page: data.totalPages });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Contacts could not be loaded.",
      );
    } finally {
      setLoading(false);
      setFetching(false);
    }
  }, [filter, page, pageSize, query, replaceParams]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);
  useEffect(() => {
    void apiFetch<Profile[]>("/api/profiles")
      .then((profileData) => {
        setProfiles(profileData);
      })
      .catch((caught) =>
        setError(
          caught instanceof Error
            ? caught.message
            : "Contact options could not be loaded.",
        ),
      );
  }, []);
  useEffect(() => setSearchDraft(query), [query]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (searchDraft.trim() !== query)
        replaceParams({ q: searchDraft.trim(), page: 1 });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query, replaceParams, searchDraft]);

  async function refreshContact(id: string) {
    const updated = await apiFetch<Contact>(`/api/contacts/${id}`);
    setSelected(updated);
    await loadPage();
  }
  async function created(id: string) {
    setNewOpen(false);
    replaceParams({ page: 1 });
    await loadPage();
    setSelected(await apiFetch<Contact>(`/api/contacts/${id}`));
  }
  async function bulkImported() {
    replaceParams({ page: 1 });
    await loadPage();
  }
  function rowKey(event: React.KeyboardEvent, contact: Contact) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setSelected(contact);
    }
  }

  if (loading)
    return (
      <div className="surface loading-state">
        <span className="spinner" />
        Loading contacts…
      </div>
    );
  return (
    <div className="contacts-view">
      <section
        className={`surface contacts-surface ${fetching ? "surface-fetching" : ""}`}
        aria-busy={fetching}
      >
        <header className="surface-toolbar">
          <div className="search-box">
            <Search size={16} />
            <input
              aria-label="Search contacts"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Search name, channel, or location"
            />
          </div>
          <div className="segmented" aria-label="Filter contacts">
            {(["all", "leads", "customers"] as Filter[]).map((value) => (
              <button
                key={value}
                className={filter === value ? "selected" : ""}
                onClick={() => replaceParams({ filter: value, page: 1 })}
              >
                {value}
                {filter === value && <span>{result.total}</span>}
              </button>
            ))}
          </div>
          <button
            className="button button-secondary"
            onClick={() => setBulkOpen(true)}
          >
            <FileUp size={16} />
            Add bulk
          </button>
          <button
            className="button button-primary"
            onClick={() => setNewOpen(true)}
          >
            <Plus size={16} />
            New contact
          </button>
        </header>
        {error && (
          <div className="page-error" role="alert">
            {error}
            <button onClick={() => void loadPage()}>Try again</button>
          </div>
        )}
        {result.rows.length ? (
          <>
            <div className="table-scroll">
              <table className="contacts-table">
                <thead>
                  <tr>
                    <th>Contact</th>
                    <th>Channels</th>
                    <th>Stage</th>
                    <th>Owner</th>
                    <th>Last touched</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((contact) => (
                    <tr
                      key={contact.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelected(contact)}
                      onKeyDown={(event) => rowKey(event, contact)}
                      aria-label={`Open ${contact.name}`}
                    >
                      <td>
                        <div className="contact-cell">
                          <HeatChip contact={contact} compact />
                          <span className="table-avatar">
                            {initials(contact.name)}
                          </span>
                          <div>
                            <strong>{contact.name}</strong>
                            <small>{contact.location || "No location"}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="channel-icons">
                          {contact.instagram && (
                            <span title="Instagram">
                              <AtSign size={14} />
                            </span>
                          )}
                          {contact.whatsapp && (
                            <span title="WhatsApp">
                              <MessageCircle size={14} />
                            </span>
                          )}
                          {contact.email && (
                            <span title="Email">
                              <Mail size={14} />
                            </span>
                          )}
                          {!contact.instagram &&
                            !contact.whatsapp &&
                            !contact.email && <small>—</small>}
                        </div>
                      </td>
                      <td>
                        <span className={`stage-chip stage-${contact.stage}`}>
                          {contact.stage}
                        </span>
                      </td>
                      <td>
                        {contact.owner ? (
                          <div className="owner-cell">
                            <span
                              className="mini-avatar"
                              style={{ backgroundColor: contact.owner.color }}
                            >
                              {initials(contact.owner.name)}
                            </span>
                            {contact.owner.name}
                          </div>
                        ) : (
                          <span className="muted">Unassigned</span>
                        )}
                      </td>
                      <td>
                        <HeatChip contact={contact} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mobile-contact-list" aria-label="Contacts">
              {result.rows.map((contact) => (
                <button
                  className="mobile-contact-card"
                  key={contact.id}
                  onClick={() => setSelected(contact)}
                  aria-label={`Open ${contact.name}`}
                >
                  <span
                    className={`mobile-heat-edge heat-edge-${contactHeat(contact)}`}
                  />
                  <span className="mobile-contact-main">
                    <span className="table-avatar">
                      {initials(contact.name)}
                    </span>
                    <span>
                      <strong>{contact.name}</strong>
                      <small>{contact.location || "No location"}</small>
                    </span>
                  </span>
                  <span className={`stage-chip stage-${contact.stage}`}>
                    {contact.stage}
                  </span>
                  <span className="mobile-contact-meta">
                    <span
                      className="channel-icons"
                      aria-label="Available channels"
                    >
                      {contact.instagram && <AtSign size={14} />}
                      {contact.whatsapp && <MessageCircle size={14} />}
                      {contact.email && <Mail size={14} />}
                      {!contact.instagram &&
                        !contact.whatsapp &&
                        !contact.email && <small>No channels</small>}
                    </span>
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
                  </span>
                  <HeatChip contact={contact} />
                </button>
              ))}
            </div>
            <Pagination
              page={result.page}
              pageSize={result.pageSize}
              total={result.total}
              totalPages={result.totalPages}
              disabled={fetching}
              onPageChange={(next) => replaceParams({ page: next })}
              onPageSizeChange={(size) =>
                replaceParams({ pageSize: size, page: 1 })
              }
            />
          </>
        ) : (
          <div className="empty-state">
            <span>
              <UsersRound size={24} />
            </span>
            <h3>{query ? "No matching contacts" : "No contacts yet"}</h3>
            <p>
              {query
                ? "Try another name, channel, or filter."
                : "Add the first relationship to start building your pipeline."}
            </p>
            {!query && (
              <div className="empty-state-actions">
                <button
                  className="button button-secondary"
                  onClick={() => setBulkOpen(true)}
                >
                  <FileUp size={16} />
                  Add bulk
                </button>
                <button
                  className="button button-primary"
                  onClick={() => setNewOpen(true)}
                >
                  <Plus size={16} />
                  Add contact
                </button>
              </div>
            )}
          </div>
        )}
      </section>
      {newOpen && (
        <NewContactModal
          profiles={profiles}
          onClose={() => setNewOpen(false)}
          onCreated={created}
        />
      )}
      {bulkOpen && (
        <BulkContactsModal
          profiles={profiles}
          onClose={() => setBulkOpen(false)}
          onImported={bulkImported}
        />
      )}
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

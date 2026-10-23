"use client";
import { useState } from "react";
import { label, money } from "@/lib/constants";
import { Empty, ErrorBox, Photo, Select, useData } from "./ui";

export function ListingPicker({
  selected,
  onChange,
  required = false,
  category = "",
}: {
  selected: any;
  onChange: (listing: any) => void;
  required?: boolean;
  category?: string;
}) {
  const [page, setPage] = useState(1);
  const { data, error, busy, reload } = useData(
    "listings?" +
      new URLSearchParams({
        category,
        status: "AVAILABLE",
        page: String(page),
      }),
    15000,
  );
  const rows: any[] = (data?.rows || []).filter(
    (listing: any) => !category || listing.categoryId === category,
  );
  const choices =
    selected && !rows.some((l) => l.id === selected.id)
      ? [selected, ...rows]
      : rows;
  return (
    <section aria-label="Link uploaded listing">
      <h3>Link an uploaded listing</h3>
      <p>
        Choose the exact plot, property or furniture item this customer is
        enquiring about.
      </p>
      <ErrorBox message={error} />
      {error && (
        <button type="button" className="text-button" onClick={reload}>
          Reload uploaded listings
        </button>
      )}
      <Select
        label="Uploaded listing"
        name="listingId"
        required={required}
        disabled={busy || !!error}
        value={selected?.id || ""}
        options={choices.map((l) => ({
          value: l.id,
          label: `${l.title} · ${l.locality} · ${money(l.price)} · ${label(l.status)} · ${l.id}`,
        }))}
        onChange={(id) => onChange(choices.find((l) => l.id === id) || null)}
      />
      {busy && <p role="status">Loading uploaded listings…</p>}
      {!busy && !rows.length && !error && (
        <Empty
          title="No matching uploaded listings"
          description="Choose another property type, or upload a listing first."
        />
      )}
      {data && data.pages > 1 && (
        <div className="pagination">
          <button
            type="button"
            className="button secondary small"
            disabled={page === 1 || busy}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous listings
          </button>
          <span>
            Page {data.page} of {data.pages}
          </span>
          <button
            type="button"
            className="button secondary small"
            disabled={page >= data.pages || busy}
            onClick={() => setPage((p) => p + 1)}
          >
            Next listings
          </button>
        </div>
      )}
      {selected && (
        <div className="listing-selection">
          <Photo id={selected.photos?.[0]?.id} alt={selected.title} />
          <div>
            <strong>{selected.title}</strong>
            <p>
              {selected.category.name} / {selected.option.name} ·{" "}
              {selected.locality}, {selected.city}
            </p>
            <strong>{money(selected.price)}</strong>
            <small>Listing ID: {selected.id}</small>
          </div>
        </div>
      )}
    </section>
  );
}

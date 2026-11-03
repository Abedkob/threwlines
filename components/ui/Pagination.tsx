"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

function pageItems(
  page: number,
  totalPages: number,
): Array<number | "ellipsis"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([1, totalPages, page - 1, page, page + 1]);
  const sorted = [...pages]
    .filter((value) => value >= 1 && value <= totalPages)
    .sort((a, b) => a - b);
  const result: Array<number | "ellipsis"> = [];

  sorted.forEach((value, index) => {
    if (index > 0 && value - sorted[index - 1] > 1) result.push("ellipsis");
    result.push(value);
  });
  return result;
}

export function Pagination({
  page,
  pageSize,
  total,
  totalPages,
  disabled = false,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  disabled?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
}) {
  if (total === 0) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);

  return (
    <nav className="pagination" aria-label="Pagination">
      <p className="pagination-summary" aria-live="polite">
        <strong>
          {first}-{last}
        </strong>{" "}
        of {total}
      </p>
      <div className="page-buttons">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={disabled || page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft size={15} />
        </button>
        {pageItems(page, totalPages).map((item, index) =>
          item === "ellipsis" ? (
            <span
              className="page-ellipsis"
              key={`ellipsis-${index}`}
              aria-hidden="true"
            >
              ...
            </span>
          ) : (
            <button
              className="page-number"
              key={item}
              onClick={() => onPageChange(item)}
              disabled={disabled}
              aria-current={item === page ? "page" : undefined}
              aria-label={`Page ${item}`}
            >
              {item}
            </button>
          ),
        )}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={disabled || page >= totalPages}
          aria-label="Next page"
        >
          <ChevronRight size={15} />
        </button>
      </div>
      {onPageSizeChange && (
        <label className="page-size">
          <span>Rows</span>
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            disabled={disabled}
          >
            {[25, 50, 100].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      )}
    </nav>
  );
}

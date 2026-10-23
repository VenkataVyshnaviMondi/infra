"use client";
import { useEffect, useRef, useState } from "react";
import { X, AlertCircle, LoaderCircle, Inbox } from "lucide-react";
import { label } from "@/lib/constants";
export class ApiError extends Error {
  constructor(
    message: string,
    public data: {
      existingCustomer?: { id: string; name: string; phone: string };
    },
  ) {
    super(message);
  }
}
export async function api<T = any>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch("/api/" + url, {
    cache: "no-store",
    ...options,
    headers: {
      ...(options?.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...options?.headers,
    },
  });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401) window.location.assign("/login");
    throw new ApiError(data.error || "Could not complete this request.", data);
  }
  if (
    options?.method &&
    options.method !== "GET" &&
    !/^(auth|photos)(\/|$)/.test(url)
  ) {
    window.dispatchEvent(new Event("kubera:data-changed"));
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel("kubera-data");
      channel.postMessage("changed");
      channel.close();
    }
  }
  return data;
}
export function useData<T = any>(url: string, refreshInterval = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [revision, setRevision] = useState(0);
  const loadedUrl = useRef<string | null>(null);
  useEffect(() => {
    const refresh = () => setRevision((v) => v + 1);
    const visible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const restored = (event: PageTransitionEvent) => {
      if (event.persisted) refresh();
    };
    window.addEventListener("kubera:data-changed", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", restored);
    document.addEventListener("visibilitychange", visible);
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("kubera-data")
        : null;
    if (channel) channel.onmessage = refresh;
    const timer = refreshInterval
      ? window.setInterval(() => {
          if (document.visibilityState === "visible") refresh();
        }, refreshInterval)
      : undefined;
    return () => {
      window.removeEventListener("kubera:data-changed", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", restored);
      document.removeEventListener("visibilitychange", visible);
      channel?.close();
      window.clearInterval(timer);
    };
  }, [refreshInterval]);
  useEffect(() => {
    let live = true;
    if (loadedUrl.current !== url) setBusy(true);
    setError("");
    api<T>(url)
      .then((d) => {
        if (live) {
          loadedUrl.current = url;
          setData(d);
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [url, revision]);
  return { data, error, busy, reload: () => setRevision((v) => v + 1) };
}
export function Badge({ value }: { value: string }) {
  return (
    <span className={"badge badge-" + value.toLowerCase()}>{label(value)}</span>
  );
}
export function ErrorBox({ message }: { message: string }) {
  return message ? (
    <div className="error-box" role="alert">
      <AlertCircle size={18} />
      <span>{message}</span>
    </div>
  ) : null;
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={24} /> Loading your records…
    </div>
  );
}
export function Empty({
  title = "No records yet",
  description = "Add your first record to get started.",
  children,
}: {
  title?: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <Inbox size={34} />
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}
export function Field({
  label: caption,
  children,
  hint,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  children?: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>
        {caption}
        {props.required && <b aria-hidden="true"> *</b>}
      </span>
      {children || <input {...props} />} {hint && <small>{hint}</small>}
    </label>
  );
}
export function Select({
  label: caption,
  options,
  value,
  onChange,
  required = false,
  name,
  disabled = false,
  placeholder,
}: {
  label: string;
  options: ({ value: string; label: string } | string)[];
  value?: string;
  onChange?: (v: string) => void;
  required?: boolean;
  name?: string;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="field">
      <span>
        {caption}
        {required && <b aria-hidden="true"> *</b>}
      </span>
      <select
        name={name}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        required={required}
        disabled={disabled}
      >
        <option value="">
          {placeholder || "Choose " + caption.toLowerCase()}
        </option>
        {options.map((o) =>
          typeof o === "string" ? (
            <option key={o} value={o}>
              {o}
            </option>
          ) : (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ),
        )}
      </select>
    </label>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    el?.showModal();
    return () => {
      el?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={wide ? "modal wide" : "modal"}
      aria-labelledby="modal-title"
    >
      <header>
        <h2 id="modal-title">{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={21} />
        </button>
      </header>
      <div className="modal-content">{children}</div>
    </dialog>
  );
}
export function ActionForm({
  onSubmit,
  children,
  submit = "Save",
  onCancel,
}: {
  onSubmit: (
    data: Record<string, string>,
    submissionKey: string,
  ) => Promise<void>;
  children: React.ReactNode;
  submit?: string;
  onCancel?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const submissionKey = useRef(crypto.randomUUID());
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (pending.current) return;
        pending.current = true;
        setBusy(true);
        setError("");
        const values = Object.fromEntries(
          new FormData(e.currentTarget).entries(),
        ) as Record<string, string>;
        try {
          await onSubmit(values, submissionKey.current);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Please try again.");
        } finally {
          pending.current = false;
          setBusy(false);
        }
      }}
    >
      <ErrorBox message={error} />
      <fieldset disabled={busy}>{children}</fieldset>
      <footer className="form-actions">
        {onCancel && (
          <button type="button" className="button secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button className="button" type="submit" disabled={busy}>
          {busy ? (
            <>
              <LoaderCircle size={17} className="spin" />
              Saving…
            </>
          ) : (
            submit
          )}
        </button>
      </footer>
    </form>
  );
}
export function Photo({
  id,
  alt,
  className,
}: {
  id?: string;
  alt: string;
  className?: string;
}) {
  return id ? (
    <img
      src={"/api/photos/" + id}
      alt={alt}
      className={className}
      loading="lazy"
    />
  ) : (
    <div className="photo-empty">No photo</div>
  );
}

"use client";
import Link from "next/link";
import { useState } from "react";
import {
  LayoutDashboard,
  UsersRound,
  Upload,
  ContactRound,
  Building2,
  LogOut,
  Menu,
  X,
  KeyRound,
  Plus,
  ChevronRight,
} from "lucide-react";
import type { Actor } from "@/lib/auth";
import { ActionForm, api, Field, Modal } from "./ui";
import { Dashboard } from "./dashboard";
import { Inventory, ListingDetail } from "./inventory";
import { ListingForm } from "./listing-form";
import { CRM, CustomerDetail } from "./crm";
import { Employees } from "./employees";
export function Workspace({ user, screen }: { user: Actor; screen: string[] }) {
  const [open, setOpen] = useState(false);
  const [change, setChange] = useState(user.mustChangePassword);
  const page = screen[0];
  const nav = [
    { href: "/dashboard", text: "Dashboard", icon: LayoutDashboard },
    { href: "/categories", text: "Categories", icon: Building2 },
    { href: "/crm", text: "Customer Data / CRM", icon: ContactRound },
    { href: "/uploads", text: "Uploads", icon: Upload },
    ...(user.role === "ADMIN"
      ? [{ href: "/employees", text: "Employee Management", icon: UsersRound }]
      : []),
  ];
  const current =
    page === "listings"
      ? "Categories"
      : page === "customers"
        ? "Customer Data / CRM"
        : nav.find((n) => n.href === "/" + page)?.text || "Workspace";
  return (
    <div className="app-shell">
      <button
        className={"sidebar-overlay " + (open ? "visible" : "")}
        onClick={() => setOpen(false)}
        aria-label="Close navigation"
        tabIndex={open ? 0 : -1}
      />
      <aside className={"sidebar " + (open ? "open" : "")}>
        <Link href="/dashboard" className="brand brand-text">
          Kubera Infra
        </Link>
        <button
          className="mobile-close icon-button"
          onClick={() => setOpen(false)}
          aria-label="Close menu"
        >
          <X size={20} />
        </button>
        <div className="workspace-label">BUSINESS WORKSPACE</div>
        <nav aria-label="Main navigation">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={current === n.text ? "active" : ""}
              onClick={() => setOpen(false)}
              aria-current={current === n.text ? "page" : undefined}
            >
              <n.icon size={19} />
              <span>{n.text}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="user-summary">
            <span className="avatar">
              {user.name
                .split(" ")
                .map((s) => s[0])
                .slice(0, 2)
                .join("")}
            </span>
            <div>
              <strong>{user.name}</strong>
              <small>
                {user.role === "ADMIN" ? "Administrator" : "Employee"}
              </small>
            </div>
          </div>
          <button onClick={() => setChange(true)}>
            <KeyRound size={16} />
            Change password
          </button>
          <button
            onClick={async () => {
              await api("auth/logout", { method: "POST" });
              window.location.assign("/login");
            }}
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-toggle"
              aria-label="Open navigation"
              onClick={() => setOpen(true)}
            >
              <Menu size={23} />
            </button>
            <span>Kubera Infra</span>
            <ChevronRight size={14} />
            <strong>{current}</strong>
          </div>
          <Link href="/uploads" className="button small">
            <Plus size={16} />
            New listing
          </Link>
        </header>
        <main className="main-content" id="main-content">
          {user.mustChangePassword ? (
            <div className="notice">
              <h1>Set your personal password</h1>
              <p>Change your temporary password to unlock your workspace.</p>
              <button className="button" onClick={() => setChange(true)}>
                Change password
              </button>
            </div>
          ) : page === "dashboard" ? (
            <Dashboard user={user} />
          ) : page === "categories" ? (
            <Inventory user={user} />
          ) : page === "listings" && screen[1] ? (
            <ListingDetail user={user} id={screen[1]} />
          ) : page === "uploads" ? (
            <ListingForm
              key={screen[1] || "new"}
              user={user}
              editId={screen[1]}
            />
          ) : page === "crm" ? (
            <CRM user={user} />
          ) : page === "customers" && screen[1] ? (
            <CustomerDetail user={user} id={screen[1]} />
          ) : page === "employees" ? (
            screen[1] ? (
              <Dashboard user={user} employeeId={screen[1]} />
            ) : (
              <Employees />
            )
          ) : (
            <div className="empty">
              <h1>Page not found</h1>
              <Link href="/dashboard">Return to dashboard</Link>
            </div>
          )}
        </main>
        <footer className="app-footer">
          Kubera Infra <span>INR · Asia/Kolkata</span>
        </footer>
      </div>
      {change && (
        <Modal title="Change password" onClose={() => setChange(false)}>
          <p>
            Use a unique password with 12–72 characters. Changing it signs out
            your other sessions.
          </p>
          <ActionForm
            submit="Update password"
            onCancel={() => setChange(false)}
            onSubmit={async (v) => {
              if (v.newPassword !== v.confirm)
                throw new Error("The new passwords do not match.");
              await api("auth/password", {
                method: "POST",
                body: JSON.stringify(v),
              });
              window.location.assign("/dashboard");
            }}
          >
            <Field
              label="Current password"
              name="currentPassword"
              type="password"
              required
              autoComplete="current-password"
            />
            <Field
              label="New password"
              name="newPassword"
              type="password"
              minLength={12}
              maxLength={72}
              required
              autoComplete="new-password"
            />
            <Field
              label="Confirm new password"
              name="confirm"
              type="password"
              minLength={12}
              required
              autoComplete="new-password"
            />
          </ActionForm>
        </Modal>
      )}
    </div>
  );
}

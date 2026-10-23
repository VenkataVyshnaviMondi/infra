"use client";
import Link from "next/link";
import { useState } from "react";
import { Plus, Search, Pencil, KeyRound } from "lucide-react";
import { date } from "@/lib/constants";
import {
  ActionForm,
  api,
  Badge,
  Empty,
  ErrorBox,
  Field,
  Loading,
  Modal,
  useData,
} from "./ui";
export function Employees() {
  const { data, error, busy, reload } = useData("employees");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState("");
  const [employee, setEmployee] = useState<any>(null);
  const done = () => {
    setModal("");
    setEmployee(null);
    reload();
  };
  const rows =
    data?.employees.filter((e: any) =>
      (e.name + " " + e.username + " " + e.phone)
        .toLowerCase()
        .includes(search.toLowerCase()),
    ) || [];
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Employee management</h1>
          <p>Manage access and understand your team’s performance.</p>
        </div>
        <button
          className="button"
          onClick={() => {
            setEmployee(null);
            setModal("employee");
          }}
        >
          <Plus size={17} />
          Add employee
        </button>
      </div>
      <div className="notice">
        Performance shows the last 30 days. Open an employee to select a date
        range. Deactivation revokes all sessions and preserves their history.
      </div>
      <div className="results-bar">
        <div className="search-field">
          <Search size={18} />
          <input
            aria-label="Search employees"
            placeholder="Search by name, phone or username"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <span>{rows.length} employees</span>
      </div>
      <ErrorBox message={error} />
      {busy ? (
        <Loading />
      ) : rows.length ? (
        <div className="panel table-wrap">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Phone</th>
                <th>Username</th>
                <th>Status</th>
                <th>Handled</th>
                <th>Leads</th>
                <th>Completed</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e: any) => (
                <tr key={e.id}>
                  <td>
                    <Link href={"/employees/" + e.id}>{e.name}</Link>
                  </td>
                  <td>{e.phone}</td>
                  <td>{e.username}</td>
                  <td>
                    <Badge value={e.active ? "ACTIVE" : "INACTIVE"} />
                  </td>
                  <td>{e.handled}</td>
                  <td>{e.generated}</td>
                  <td>{e.conversions}</td>
                  <td>{date(e.createdAt)}</td>
                  <td>
                    <div className="button-row">
                      <button
                        className="icon-button"
                        aria-label={"Edit " + e.name}
                        onClick={() => {
                          setEmployee(e);
                          setModal("employee");
                        }}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={"Reset password for " + e.name}
                        onClick={() => {
                          setEmployee(e);
                          setModal("reset");
                        }}
                      >
                        <KeyRound size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="No employees found"
          description="Add an employee or adjust your search."
        />
      )}
      {modal && (
        <Modal
          title={
            modal === "reset"
              ? "Reset employee password"
              : employee
                ? "Edit employee"
                : "Add employee"
          }
          onClose={() => setModal("")}
        >
          <ActionForm
            submit={
              modal === "reset"
                ? "Reset password"
                : employee
                  ? "Save changes"
                  : "Create employee"
            }
            onCancel={() => setModal("")}
            onSubmit={async (v) => {
              if (modal === "reset")
                await api("employees/" + employee.id + "/reset", {
                  method: "POST",
                  body: JSON.stringify(v),
                });
              else
                await api("employees" + (employee ? "/" + employee.id : ""), {
                  method: employee ? "PATCH" : "POST",
                  body: JSON.stringify({
                    ...v,
                    active: employee ? v.active === "true" : true,
                  }),
                });
              done();
            }}
          >
            {modal === "reset" ? (
              <>
                <p>
                  Set a temporary password for {employee.name}. All their
                  sessions will be revoked. They must choose a new password at
                  next login.
                </p>
                <Field
                  label="Temporary password"
                  type="password"
                  name="password"
                  minLength={12}
                  maxLength={72}
                  required
                  autoComplete="new-password"
                />
              </>
            ) : (
              <>
                <Field
                  label="Name"
                  name="name"
                  required
                  defaultValue={employee?.name}
                />
                <Field
                  label="Phone number"
                  name="phone"
                  type="tel"
                  required
                  defaultValue={employee?.phone}
                />
                <Field
                  label="Username"
                  name="username"
                  pattern="[a-zA-Z0-9._-]{3,40}"
                  required
                  defaultValue={employee?.username}
                  autoComplete="off"
                />
                {!employee && (
                  <Field
                    label="Temporary password"
                    type="password"
                    name="password"
                    minLength={12}
                    maxLength={72}
                    required
                    autoComplete="new-password"
                    hint="At least 12 characters. The employee must change this on first login."
                  />
                )}
                {employee && (
                  <label className="field">
                    <span>Access status</span>
                    <select
                      name="active"
                      defaultValue={String(employee.active)}
                    >
                      <option value="true">Active</option>
                      <option value="false">Inactive — revoke access</option>
                    </select>
                  </label>
                )}
              </>
            )}
          </ActionForm>
        </Modal>
      )}
    </>
  );
}

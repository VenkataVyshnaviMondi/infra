"use client";
import { useState } from "react";
import { ArrowRight, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { ActionForm, api, Field } from "./ui";
export function Login() {
  const [show, setShow] = useState(false);
  return (
    <main className="login-page">
      <section className="login-intro">
        <div className="login-brand-text">Kubera Infra</div>
        <div>
          <h1>
            Every property.
            <br />
            Every relationship.
            <br />
            <span>One workspace.</span>
          </h1>
          <p>
            Manage your inventory, customer conversations and next steps with a
            clear view of your business.
          </p>
        </div>
        <span className="login-security">
          <ShieldCheck size={18} /> Private workspace · Authorized employees
          only
        </span>
      </section>
      <section className="login-form">
        <div className="login-box">
          <h2>Welcome back</h2>
          <p>Sign in to your Kubera Infra account.</p>
          <ActionForm
            submit="Sign in"
            onSubmit={async (v) => {
              await api("auth/login", {
                method: "POST",
                body: JSON.stringify(v),
              });
              window.location.assign("/dashboard");
            }}
          >
            <Field
              label="Username"
              name="username"
              autoComplete="username"
              required
              autoFocus
            />
            <div className="password-field">
              <Field
                label="Password"
                name="password"
                type={show ? "text" : "password"}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="icon-button"
                onClick={() => setShow(!show)}
                aria-label={show ? "Hide password" : "Show password"}
              >
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </ActionForm>
          <p className="login-help">
            Need access or a password reset?
            <br />
            Contact your Kubera Infra administrator.
          </p>
        </div>
        <small>
          Kubera Infra · Internal business application <ArrowRight size={14} />
        </small>
      </section>
    </main>
  );
}

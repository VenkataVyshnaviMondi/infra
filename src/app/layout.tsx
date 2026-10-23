import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Kubera Infra | Workspace",
  description:
    "Internal property, inventory and customer management for Kubera Infra.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-IN">
      <body>{children}</body>
    </html>
  );
}

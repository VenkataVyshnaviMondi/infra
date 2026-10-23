export default function Loading() {
  return (
    <main className="fatal" aria-busy="true">
      <div className="spinner" />
      <p>Opening your workspace…</p>
    </main>
  );
}

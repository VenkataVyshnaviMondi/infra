"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="fatal">
      <h1>Something interrupted this page.</h1>
      <p>Your saved records are safe. Try loading the page again.</p>
      <button onClick={reset}>Try again</button>
    </main>
  );
}

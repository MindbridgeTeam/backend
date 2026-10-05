export default function HomePage() {
  return (
    <main style={{ fontFamily: 'sans-serif', padding: '2rem' }}>
      <h1>Mindbridge API</h1>
      <p>Vercel migration phase 1 is running.</p>
      <p>
        <a href="/api/health">Health check</a>
      </p>
    </main>
  );
}

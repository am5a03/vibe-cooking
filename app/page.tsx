export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-20">
      <p className="mb-4 text-sm uppercase tracking-widest">Vibe Cooking · Personal kitchen</p>
      <h1 className="mb-6 text-4xl font-semibold">A foundation for your recipe studio.</h1>
      <p className="mb-6">Next.js on Cloudflare Workers, with D1 and Drizzle. Recipes, versions, favourites and cooking notes live behind a private API.</p>
      <p className="mb-6">This is the backend setup landing page. The MealSpin v2 interface is not connected yet.</p>
      <a className="underline" href="/api/health">Check API liveness</a>
      <p className="mt-8 text-sm">Follow README.md to configure your private secret, apply local migrations and import the starter catalogue. A liveness response does not confirm database setup.</p>
    </main>
  );
}

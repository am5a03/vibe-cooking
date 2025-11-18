export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <main className="text-center px-4">
        <h1 className="text-6xl font-bold text-gray-900 mb-4">
          Vibe Cooking
        </h1>
        <p className="text-xl text-gray-600 mb-8">
          Full-stack Next.js 15 + Cloudflare Stack
        </p>
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-2xl mx-auto">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            Stack Includes:
          </h2>
          <ul className="text-left space-y-2 text-gray-700">
            <li>✅ Next.js 15 with App Router</li>
            <li>✅ React 19</li>
            <li>✅ TypeScript</li>
            <li>✅ TailwindCSS 4</li>
            <li>✅ Cloudflare Workers</li>
            <li>✅ Cloudflare D1 (SQLite)</li>
            <li>✅ Cloudflare R2 Storage</li>
            <li>✅ Drizzle ORM</li>
            <li>✅ Better Auth</li>
            <li>✅ shadcn/ui</li>
            <li>✅ Biome (Linting & Formatting)</li>
          </ul>
        </div>
        <p className="mt-8 text-gray-600">
          Ready to build something amazing!
        </p>
      </main>
    </div>
  );
}

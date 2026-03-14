import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-amber-500 text-6xl font-bold font-mono mb-4">
          404
        </h1>
        <p className="text-white text-xl mb-2">Page not found</p>
        <p className="text-gray-400 mb-8">
          The page you are looking for does not exist.
        </p>
        <div className="flex gap-4 justify-center">
          <Link href="/" 
            className="bg-amber-500 text-black px-6 py-2 rounded font-bold">
            Go Home
          </Link>
          <Link href="/tools"
            className="border border-amber-500 text-amber-500 
              px-6 py-2 rounded font-bold">
            Quick Tools
          </Link>
        </div>
      </div>
    </div>
  )
}

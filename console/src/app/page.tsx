export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">ApexMediation</h1>
        <p className="text-gray-600 mb-8">Enterprise Publisher Console</p>
        <a
          href="/login"
          className="inline-block px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          Go to Login
        </a>
      </div>
    </div>
  )
}

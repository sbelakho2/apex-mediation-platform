'use client'

export default function ForbiddenPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-lg w-full text-center bg-white border rounded-xl p-8">
        <h1 className="text-3xl font-bold text-gray-900">403 — Forbidden</h1>
        <p className="text-gray-600 mt-3">
          You do not have permission to access this page. If you believe this is an error, contact your administrator.
        </p>
      </div>
    </div>
  )
}

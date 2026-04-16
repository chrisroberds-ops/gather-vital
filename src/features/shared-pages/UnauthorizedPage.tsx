import { useNavigate } from 'react-router-dom'

export default function UnauthorizedPage() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center p-8">
      <div className="text-5xl mb-4">🔒</div>
      <h1 className="text-2xl font-bold text-gray-900">Access Restricted</h1>
      <p className="text-gray-500 mt-2">You don't have permission to view this page.</p>
      <button
        onClick={() => navigate(-1)}
        className="mt-6 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
      >
        Go back
      </button>
    </div>
  )
}

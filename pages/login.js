export default function LoginPage() {
  return (
    <div className="min-h-screen bg-canvas dark:bg-navy-900 p-4 md:p-8">
      <div className="max-w-md mx-auto">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">Sign in</h2>
        <form
          onSubmit={() => alert('Login handled')}
          className="space-y-4 p-6 bg-white dark:bg-navy-800 rounded-md"
        >
          <input
            placeholder="Email"
            type="email"
            className="w-full p-2 border border-slate-300 dark:border-navy-600 rounded-md mb-4"
          />
          <input
            placeholder="Password"
            type="password"
            className="w-full p-2 border border-slate-300 dark:border-navy-600 rounded-md mb-4"
          />
          <button
            type="submit"
            className="w-full rounded-md bg-brand-600 px-4 py-2 text-white font-medium hover:bg-brand-700 transition-colors"
          >
            Sign in
          </button>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Or <a href="/api/auth/google/start" className="font-medium text-brand-600 underline">sign in with Google</a>
          </p>
        </form>
      </div>
    </div>
  );
}
// {{AUTH_IMPORTS}}
import { Button } from "../components/Button.tsx";
import { define } from "../utils.ts";

export const handler = define.handlers({
  async POST(ctx) {
    const form = await ctx.req.formData();
    const login = form.get("login")?.toString();
    const password = form.get("password")?.toString();

    if (!login || !password) {
      ctx.state.flash("error", "Invalid {{LOGIN_FIELD}} or password");
      return ctx.redirect("/login");
    }

    // {{AUTH_LOGIC}}

    return ctx.redirect("/");
  },
});

export default define.page((ctx) => {
  const error = ctx.state.flash("error");

  return (
    <div class="min-h-[80vh] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div class="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 class="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Sign in to your account
        </h2>
      </div>

      <div class="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div class="bg-white py-8 px-4 shadow-xl border border-gray-100 sm:rounded-lg sm:px-10">
          {error && (
            <div
              class="bg-red-50 border-l-4 border-red-400 p-4 mb-6 rounded-r-md shadow-sm flex items-center"
              role="alert"
            >
              <div class="shrink-0">
                <svg
                  class="h-5 w-5 text-red-400"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fill-rule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clip-rule="evenodd"
                  />
                </svg>
              </div>
              <div class="ml-3">
                <p class="text-sm text-red-700 font-medium">{error}</p>
              </div>
            </div>
          )}

          <form method="POST" class="space-y-6">
            {/* {{LOGIN_FIELDS}} */}

            <label class="block space-y-1">
              <span class="block text-sm font-semibold text-gray-700">
                Password
              </span>
              <input
                type="password"
                name="password"
                placeholder="••••••••"
                class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 sm:text-sm transition-all outline-none"
                required
              />
            </label>

            <div>
              <Button
                type="submit"
                class="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all outline-none"
              >
                Sign in
              </Button>
            </div>
          </form>

          <div class="mt-6">
            <div class="relative flex items-center">
              <div class="grow border-t border-gray-200"></div>
              <span class="shrink mx-4 text-gray-400 text-sm font-medium">
                New here?
              </span>
              <div class="grow border-t border-gray-200"></div>
            </div>

            <div class="mt-6">
              <a
                href="/register"
                class="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-all"
              >
                Create an account
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

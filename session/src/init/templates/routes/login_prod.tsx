// {{AUTH_IMPORTS}}
import { Button } from "../components/Button.tsx";
import { define } from "../utils.ts";

export const handler = define.handlers({
  async POST(ctx) {
    const form = await ctx.req.formData();
    const login = form.get("login")?.toString();
    const password = form.get("password")?.toString();

    if (login && password) {
      // {{AUTH_LOGIC}}

      return ctx.redirect("/");
    }

    ctx.state.flash("error", "Invalid {{LOGIN_FIELD}} or password");

    return ctx.redirect("/login");
  },
});

export default define.page<typeof handler>((ctx) => {
  const error = ctx.state.flash("error");

  return (
    <div class="min-h-[80vh] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div class="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 class="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Sign in to your account
        </h2>
      </div>

      <div class="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div class="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10 card bg-base-100 shadow-xl border border-gray-100">
          {error && (
            <div
              class="bg-red-50 border-l-4 border-red-400 p-4 mb-6 alert alert-error shadow-sm"
              role="alert"
            >
              <div class="flex">
                <div class="flex-shrink-0">
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
                  <p class="text-sm text-red-700">{error}</p>
                </div>
              </div>
            </div>
          )}

          <form method="POST" class="space-y-6">
            {/* {{LOGIN_FIELDS}} */}

            <div class="space-y-1">
              <label class="block text-sm font-medium text-gray-700 label">
                <span class="label-text font-semibold">Password</span>
              </label>
              <div class="mt-1">
                <input
                  type="password"
                  name="password"
                  placeholder="••••••••"
                  class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm input input-bordered focus:input-primary transition-all"
                  required
                />
              </div>
            </div>

            <div>
              <Button
                type="submit"
                class="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 btn btn-primary transition-all"
              >
                Sign in
              </Button>
            </div>
          </form>

          <div class="mt-6">
            <div class="relative">
              <div class="absolute inset-0 flex items-center">
                <div class="w-full border-t border-gray-300"></div>
              </div>
              <div class="relative flex justify-center text-sm">
                <span class="px-2 bg-white text-gray-500 bg-base-100">
                  New here?
                </span>
              </div>
            </div>

            <div class="mt-6">
              <a
                href="/register"
                class="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 btn btn-outline transition-all"
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

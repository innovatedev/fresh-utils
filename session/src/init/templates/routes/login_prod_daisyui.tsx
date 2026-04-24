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
        <h2 class="mt-6 text-center text-3xl font-extrabold text-base-content">
          Sign in to your account
        </h2>
      </div>

      <div class="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div class="card bg-base-100 shadow-xl border border-base-200 py-8 px-4 sm:rounded-lg sm:px-10">
          {error && (
            <div class="alert alert-error shadow-sm mb-6" role="alert">
              <svg
                class="h-5 w-5"
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
              <span>{error}</span>
            </div>
          )}

          <form method="POST" class="space-y-6">
            {/* {{LOGIN_FIELDS}} */}

            <label class="form-control w-full">
              <div class="label">
                <span class="label-text font-semibold">Password</span>
              </div>
              <input
                type="password"
                name="password"
                placeholder="••••••••"
                class="input input-bordered w-full focus:input-primary transition-all"
                required
              />
            </label>

            <div>
              <Button
                type="submit"
                class="w-full btn btn-primary transition-all"
              >
                Sign in
              </Button>
            </div>
          </form>

          <div class="mt-6">
            <div class="divider text-sm text-base-content/60">
              New here?
            </div>

            <div class="mt-6">
              <a
                href="/register"
                class="w-full btn btn-outline transition-all"
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

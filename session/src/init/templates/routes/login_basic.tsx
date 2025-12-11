import { define } from "../utils.ts";

export const handler = define.handlers({
  async POST(ctx) {
    const form = await ctx.req.formData();
    const username = form.get("username")?.toString();

    if (username) {
      // Logic to verify credentials goes here

      // Log user in
      await ctx.state.login(username, { username });
      return ctx.redirect("/");
    }

    // Set validation error using flash
    ctx.state.flash("error", "Invalid username");

    return ctx.redirect("/login");
  },
});

export default define.page<typeof handler>((ctx) => {
  const error = ctx.state.flash("error");

  return (
    <div class="p-4 mx-auto max-w-screen-md">
      <h1 class="text-2xl font-bold mb-4">Login</h1>

      {error && (
        <div
          class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4"
          role="alert"
        >
          <span class="block sm:inline">{error}</span>
        </div>
      )}

      <form method="POST">
        <div class="mb-4">
          <input
            type="text"
            name="username"
            placeholder="Username"
            class="border p-2 rounded w-full"
            required
          />
        </div>
        <button type="submit" class="bg-blue-500 text-white p-2 rounded">
          Login
        </button>
      </form>

      <p class="mt-4 text-center">
        Don't have an account?{" "}
        <a href="/register" class="text-blue-500 hover:underline">Register</a>
      </p>
    </div>
  );
});

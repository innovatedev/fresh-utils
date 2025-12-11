import { define } from "../utils.ts";

export const handler = define.handlers({
  async POST(ctx) {
    const form = await ctx.req.formData();
    const username = form.get("username")?.toString();

    if (!username) {
      ctx.state.flash("error", "Missing username");
      return ctx.redirect("/register");
    }

    // Logic to save user goes here

    // Log them in
    await ctx.state.login(username, { username });

    return ctx.redirect("/");
  },
});

export default define.page<typeof handler>((ctx) => {
  const error = ctx.state.flash("error");

  return (
    <div class="p-4 mx-auto max-w-screen-md">
      <h1 class="text-2xl font-bold mb-4">Register</h1>

      {error && (
        <div
          class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4"
          role="alert"
        >
          <span class="block sm:inline">{error}</span>
        </div>
      )}

      <form method="POST" class="flex flex-col gap-4">
        <div>
          <label class="block mb-1">Username</label>
          <input
            type="text"
            name="username"
            class="border p-2 rounded w-full"
            required
          />
        </div>
        <button type="submit" class="bg-green-500 text-white p-2 rounded">
          Register
        </button>
      </form>

      <p class="mt-4 text-center">
        Already have an account?{" "}
        <a href="/login" class="text-blue-500 hover:underline">Login</a>
      </p>
    </div>
  );
});

import { define } from "../utils.ts";
/* import { hash } from "@felix/argon2"; */

export const handler = define.handlers({
  async POST(ctx) {
    const form = await ctx.req.formData();
    const username = form.get("username")?.toString();
    const password = form.get("password")?.toString();

    if (!username || !password) {
      ctx.state.flash("error", "Missing username or password");
      return ctx.redirect("/register");
    }

    if (password.length < 8) {
      ctx.state.flash("error", "Password too short");
      return ctx.redirect("/register");
    }

    /*
    const kv = await Deno.openKv();
    const existing = await kv.get(["users", username]);
    if (existing.value) {
       ctx.state.flash("error", "User already exists");
       return ctx.redirect("/register");
    }

    // 1. Hash the password
    const passwordHash = await hash(password);

    // 2. Save user to DB (Example using Deno KV)
    const user = { username, passwordHash };
    await kv.set(["users", username], user);
    */

    // 3. Log them in
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
        <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4" role="alert">
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
        <div>
          <label class="block mb-1">Password</label>
          <input
            type="password"
            name="password"
            class="border p-2 rounded w-full"
            minLength={8}
            required
          />
        </div>
        <button type="submit" class="bg-green-500 text-white p-2 rounded">
          Register
        </button>
      </form>
    </div>
  );
});

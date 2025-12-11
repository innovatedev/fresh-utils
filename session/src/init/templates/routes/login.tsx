import { define } from "../utils.ts";
// import { verify } from "@felix/argon2";

export const handler = define.handlers({
  async POST(ctx) {
    const form = await ctx.req.formData();
    const username = form.get("username")?.toString();
    const password = form.get("password")?.toString();

    if (username && password) {
      // 1. Fetch user from DB (Example using Deno KV)
      /*
      const kv = await Deno.openKv();
      const userRes = await kv.get(["users", username]);
      const user = userRes.value as { username: string; passwordHash: string } | null;

      if (!user) {
         // User not found (generic error for security)
         return ctx.redirect("/login");
      }

      // 2. Verify password
      const isValid = await verify(user.passwordHash, password);
      if (!isValid) {
         return ctx.redirect("/login");
      }
      */

      // 3. Log user in (Rotation is handled automatically)
      // Note: In a real app, do this ONLY after verification passes!
      await ctx.state.login(username, { username });

      return ctx.redirect("/");
    }

    return ctx.redirect("/login");
  },
});

export default define.page(() => {
  return (
    <div class="p-4 mx-auto max-w-screen-md">
      <h1 class="text-2xl font-bold mb-4">Login</h1>
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
        <div class="mb-4">
          <input
            type="password"
            name="password"
            placeholder="Password"
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

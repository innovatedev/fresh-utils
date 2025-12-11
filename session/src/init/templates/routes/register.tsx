import { define } from "../utils.ts";
import { hash } from "@felix/argon2";

export const handler = define.handlers({
  async POST(ctx) {
    const form = await ctx.req.formData();
    const username = form.get("username")?.toString();
    const password = form.get("password")?.toString();

    if (!username || !password) {
      return new Response("Missing username or password", { status: 400 });
    }

    if (password.length < 8) {
      return new Response("Password too short", { status: 400 });
    }

    // Example user check (Replace with your DB logic)
    // const kv = await Deno.openKv();
    // const existing = await kv.get(["users", username]);
    // if (existing.value) {
    //    return new Response("User already exists", { status: 409 });
    // }

    // 1. Hash the password
    // deno-lint-ignore no-unused-vars
    const passwordHash = await hash(password);

    // 2. Save user to DB (Example using Deno KV)
    /*
    const user = { username, passwordHash };
    await kv.set(["users", username], user);
    */

    // 3. Log them in
    await ctx.state.login(username, { username });

    return ctx.redirect("/");
  },
});

export default define.page(() => {
  return (
    <div class="p-4 mx-auto max-w-screen-md">
      <h1 class="text-2xl font-bold mb-4">Register</h1>
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

      <p class="mt-4 text-center">
        Already have an account?{" "}
        <a href="/login" class="text-blue-500 hover:underline">Login</a>
      </p>
    </div>
  );
});

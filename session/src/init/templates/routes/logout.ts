import { define } from "../utils.ts";

export const handler = define.handlers({
  // deno-lint-ignore no-explicit-any
  async POST(ctx: any) {
    // Destroy session
    await ctx.state.logout();

    return ctx.redirect("/");
  },
});

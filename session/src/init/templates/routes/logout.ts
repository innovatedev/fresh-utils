import { define } from "../utils.ts";

export const handler = define.handlers({
  async POST(ctx) {
    // Destroy session
    await ctx.state.logout();

    return ctx.redirect("/");
  },
});

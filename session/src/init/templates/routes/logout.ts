import { defineAuth } from "../utils.ts";

export const handler = defineAuth.handlers({
  async POST(ctx) {
    // Destroy session
    await ctx.state.logout();

    return ctx.redirect("/");
  },
});

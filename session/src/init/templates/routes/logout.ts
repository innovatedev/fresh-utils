import { define } from "../utils.ts";

export const handler = define.handlers({
  GET(ctx) {
    // Destroy session
    ctx.state.logout();

    return ctx.redirect("/");
  },
});

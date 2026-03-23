import { define } from "../utils.ts";

export const handler = define.handlers({
  POST(ctx) {
    // Destroy session
    ctx.state.logout();

    return ctx.redirect("/");
  },
});

import { define } from "../utils.ts";

export const handler = define.handlers({
  POST(ctx) {
    // Destroy session
    // {{AUTH_LOGIC}}
    ctx.state.logout();

    return ctx.redirect("/");
  },
});

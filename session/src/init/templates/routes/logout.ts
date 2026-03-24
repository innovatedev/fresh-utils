import { define } from "../utils.ts";

export const handler = define.handlers({
  // deno-lint-ignore require-await
  async POST(ctx) {
    // Destroy session
    // {{AUTH_LOGIC}}
    ctx.state.logout();

    return ctx.redirect("/");
  },
});

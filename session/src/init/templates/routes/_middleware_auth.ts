import { define } from "../utils.ts";
import { authOnlyMiddleware } from "@innovatedev/fresh-session";

export const handler = define.middleware([
  authOnlyMiddleware("{{REDIRECT}}"),
]);

import { define } from "../utils.ts";
import { guestOnlyMiddleware } from "@innovatedev/fresh-session";

export const handler = define.middleware([
  guestOnlyMiddleware("{{REDIRECT}}"),
]);

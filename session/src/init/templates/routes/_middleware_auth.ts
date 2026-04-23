import { defineAuth } from "../utils.ts";
import { authOnlyMiddleware } from "@innovatedev/fresh-session";

export const handler = defineAuth.middleware([
  authOnlyMiddleware("{{REDIRECT}}"),
]);

import { authOnly } from "@innovatedev/fresh-session";

export const handler = [
  authOnly("{{REDIRECT}}"),
];

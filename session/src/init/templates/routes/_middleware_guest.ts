import { guestOnly } from "@innovatedev/fresh-session";

export const handler = [
  guestOnly("{{REDIRECT}}"),
];

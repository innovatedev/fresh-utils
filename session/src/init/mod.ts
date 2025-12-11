/**
 * @module
 *
 * This module provides the CLI entrypoint for the `init` command.
 *
 * The `init` command automates the setup of `@innovatedev-fresh/session` in a Fresh project
 * by creating configuration files, route handlers, and updating `deno.json`.
 *
 * @example
 * Run directly via Deno:
 * ```bash
 * deno run -A jsr:@innovatedev-fresh/session/init
 * ```
 */
import { Command } from "./deps.ts";
import { initAction } from "./commands/init.ts";

export { initAction };

if (import.meta.main) {
  await new Command()
    .name("session-init")
    .version("0.1.0")
    .description("Initialize session middleware for Fresh")
    .option("-s, --store <store:string>", "Store type (memory, kv)", {
      default: "kv",
    })
    .option("-p, --preset <preset:string>", "Preset (none, basic, kv-basic, kv-prod)")
    .option("-y, --yes", "Skip prompts and use defaults/arguments")
    .action(initAction)
    .parse(Deno.args);
}

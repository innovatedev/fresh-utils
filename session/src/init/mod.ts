import { Command } from "jsr:@cliffy/command@1.0.0-rc.8";
import { initAction } from "./commands/init.ts";

if (import.meta.main) {
  await new Command()
    .name("session-init")
    .version("0.1.0")
    .description("Initialize session middleware for Fresh")
    .option("-s, --store <store:string>", "Store type (memory, kv)", {
      default: "memory",
    })
    .option("-y, --yes", "Skip prompts and use defaults/arguments")
    .action(initAction)
    .parse(Deno.args);
}

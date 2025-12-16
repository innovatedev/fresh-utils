import { join, resolve } from "@std/path";
import { Command } from "@cliffy/command";

export const checkDocsCommand = new Command()
  .name("check-docs")
  .description(
    "Automatically run deno doc --lint on all exported files in workspaces",
  )
  .action(async () => {
    console.log("Checking documentation for all workspaces...");

    // 1. Get Workspaces
    let workspaces: string[] = [];
    try {
      const rootDenoJson = JSON.parse(await Deno.readTextFile("deno.json"));
      workspaces = rootDenoJson.workspace || [];
    } catch {
      console.warn(
        "Could not read workspace configuration from root deno.json",
      );
    }
    // Always include current dir if no workspaces defined, or if it's a standalone repo
    if (workspaces.length === 0) {
      workspaces.push(".");
    }

    let failure = false;

    for (const workspace of workspaces) {
      const workspacePath = resolve(workspace);
      const denoJsonPath = join(workspacePath, "deno.json");

      try {
        const denoJsonContent = await Deno.readTextFile(denoJsonPath);
        const denoJson = JSON.parse(denoJsonContent);

        if (!denoJson.exports) {
          console.log(`Skipping ${workspace} (no exports found)`);
          continue;
        }

        console.log(`Processing workspace: ${workspace}`);

        // 2. Resolve exported files
        const exportedFiles: string[] = [];
        const exports = denoJson.exports;

        if (typeof exports === "string") {
          exportedFiles.push(join(workspacePath, exports));
        } else if (typeof exports === "object") {
          for (const value of Object.values(exports)) {
            if (typeof value === "string") {
              exportedFiles.push(join(workspacePath, value));
            }
          }
        }

        if (exportedFiles.length === 0) {
          console.log(`No files to check in ${workspace}`);
          continue;
        }

        // 3. Run deno doc --lint
        console.log(
          `Checking ${exportedFiles.length} files in ${workspace}...`,
        );

        const cmd = new Deno.Command("deno", {
          args: ["doc", "--lint", ...exportedFiles],
          cwd: Deno.cwd(), // Run from root, files are absolute
          stdout: "inherit",
          stderr: "inherit",
        });

        const output = await cmd.output();
        if (!output.success) {
          console.error(`❌ Documentation check failed for ${workspace}`);
          failure = true;
        } else {
          console.log(`✅ Documentation check passed for ${workspace}`);
        }
      } catch (e) {
        if (e instanceof Deno.errors.NotFound) {
          // No deno.json in workspace, skip
        } else {
          console.error(`Error processing ${workspace}:`, e);
          failure = true;
        }
      }
    }

    if (failure) {
      Deno.exit(1);
    } else {
      console.log("\nAll documentation checks passed!");
    }
  });

if (import.meta.main) {
  await checkDocsCommand.parse(Deno.args);
}

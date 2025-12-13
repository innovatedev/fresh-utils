import { Command } from "@cliffy/command";
import { join } from "@std/path";

export const recommendedReadmeFooter = `## AI Transparency

⚠️ This project is primarily AI-assisted (Antigravity, Copilot, Cursor, Gemini,
ChatGPT, Composer, Claude, Grok); all code is directed, reviewed, and tested by
humans.`;

export const securityDisclosure = `## Security Issues

Report any security related issues to security@innovate.dev`;

const hasLicenseFile = async (workspace: string) => {
  const licensePath = join(workspace, "LICENSE");
  return await Deno.stat(licensePath).then(() => true).catch(() => false);
};

const hasReadmeFile = async (workspace: string) => {
  const readmePath = join(workspace, "README.md");
  return await Deno.stat(readmePath).then(() => true).catch(() => false);
};

const hasAiDisclosure = async (workspace: string) => {
  const readmePath = join(workspace, "README.md");
  try {
    const readmeContent = await Deno.readTextFile(readmePath);
    const disclosureIndex = readmeContent.indexOf(recommendedReadmeFooter);

    if (disclosureIndex === -1) return false;

    // Check if there are any other `## ` sections BEFORE the disclosure
    // We look for "\n## " to avoid matching inline text or code blocks that might have ##
    // We also check for start of file "## "
    const contentBefore = readmeContent.substring(0, disclosureIndex);

    // If content before has "\n## ", then there is a section above us -> NOT COMPLIANT (needs moving)
    if (contentBefore.includes("\n## ")) return false;

    // Also check if the file starts with "## " (but it's not our disclosure, which we know is at disclosureIndex)
    // If disclosureIndex is 0, then it's at the top -> COMPLIANT
    if (disclosureIndex > 0 && contentBefore.startsWith("## ")) return false;

    return true;
  } catch {
    return false;
  }
};

const hasSecurityDisclosure = async (workspace: string) => {
  const readmePath = join(workspace, "README.md");
  try {
    const readmeContent = await Deno.readTextFile(readmePath);

    // 1. Check if it exists
    if (!readmeContent.includes(securityDisclosure)) return false;

    // 2. Check if it's at the bottom
    // We trim the content for the check to ignore trailing newlines variability
    const trimmedContent = readmeContent.trimEnd();
    const trimmedDisclosure = securityDisclosure.trimEnd();

    return trimmedContent.endsWith(trimmedDisclosure);
  } catch {
    return false;
  }
};

const aiTags = ["ai-generated", "ai-assisted"];
const denoJsonHasLicenseAndTags = async (workspace: string) => {
  const denoJsonPath = join(workspace, "deno.json");
  try {
    const denoJsonContent = await Deno.readTextFile(denoJsonPath);
    const denoJson = JSON.parse(denoJsonContent);
    return denoJson.license && denoJson.tags &&
      aiTags.some((tag) => denoJson.tags.includes(tag));
  } catch {
    return false;
  }
};

export const aiDisclosureCommand = new Command()
  .name("compliance")
  .description(
    "Add AI disclosure to README.md and MIT license to LICENSE and deno.json files for workspaces",
  )
  .action(async () => {
    console.log("Ensuring AI disclosure and MIT license for all workspaces...");
    let workspaces: string[] = [];
    try {
      workspaces = JSON.parse(await Deno.readTextFile("deno.json")).workspace ||
        [];
    } catch {
      console.warn("Could not read workspace configuration from deno.json");
    }
    workspaces.push(".");
    let defaultLicenseFile: string | null = null;

    for (const workspace of workspaces) {
      console.log(`Processing workspace: ${workspace}`);

      if (
        !await hasReadmeFile(workspace) || !await hasAiDisclosure(workspace) ||
        !await hasSecurityDisclosure(workspace)
      ) {
        const readmePath = join(workspace, "README.md");
        let readmeContent = "";
        try {
          readmeContent = await Deno.readTextFile(readmePath);
        } catch {
          // ignore
        }
        let newReadmeContent = readmeContent;

        // 1. Remove existing disclosure if present
        const header = recommendedReadmeFooter.split("\n")[0]; // "## AI Transparency"
        const headerIndex = newReadmeContent.indexOf(header);

        if (headerIndex !== -1) {
          console.log(`Removing existing AI disclosure from ${readmePath}`);

          // Find the start of the next section, if any
          const remainingContent = newReadmeContent.substring(
            headerIndex + header.length,
          );
          const nextSectionIndexRelative = remainingContent.indexOf("\n## ");

          const before = newReadmeContent.substring(0, headerIndex).trimEnd();
          let after = "";

          if (nextSectionIndexRelative !== -1) {
            const nextSectionIndex = headerIndex + header.length +
              nextSectionIndexRelative;
            after = newReadmeContent.substring(nextSectionIndex).trimStart();
          }

          if (before.length > 0 && after.length > 0) {
            newReadmeContent = before + "\n\n" + after;
          } else {
            newReadmeContent = before + after;
          }
        }

        // 2. Insert at the top (before the first "## ")
        const firstSectionIndex = newReadmeContent.indexOf("## ");

        if (firstSectionIndex !== -1) {
          // Insert before the first section
          const before = newReadmeContent.substring(0, firstSectionIndex)
            .trimEnd();
          const after = newReadmeContent.substring(firstSectionIndex); // Starts with "## "

          const separator = before.length > 0 ? "\n\n" : "";
          newReadmeContent = before + separator +
            recommendedReadmeFooter + "\n\n" +
            after;
        } else {
          // No other sections, just append
          newReadmeContent = newReadmeContent.trimEnd();
          const separator = newReadmeContent.length > 0 ? "\n\n" : "";
          newReadmeContent = newReadmeContent + separator +
            recommendedReadmeFooter;
        }

        // 3. Handle Security Disclosure (force to bottom)
        // Remove existing
        const securityHeader = securityDisclosure.split("\n")[0];
        const securityHeaderIndex = newReadmeContent.indexOf(securityHeader);
        if (securityHeaderIndex !== -1) {
          console.log(
            `Removing existing Security Disclosure from ${readmePath}`,
          );
          const secBefore = newReadmeContent.substring(0, securityHeaderIndex)
            .trimEnd();

          // Find end of this section (start of next or EOF)
          const secRemaining = newReadmeContent.substring(
            securityHeaderIndex + securityHeader.length,
          );
          const nextSecRelative = secRemaining.indexOf("\n## ");

          let secAfter = "";
          if (nextSecRelative !== -1) {
            const nextSecIndex = securityHeaderIndex + securityHeader.length +
              nextSecRelative;
            secAfter = newReadmeContent.substring(nextSecIndex).trimStart();
          }

          if (secBefore.length > 0 && secAfter.length > 0) {
            newReadmeContent = secBefore + "\n\n" + secAfter;
          } else {
            newReadmeContent = secBefore + secAfter;
          }
        }

        // Append to bottom
        newReadmeContent = newReadmeContent.trimEnd();
        const secSeparator = newReadmeContent.length > 0 ? "\n\n" : "";
        newReadmeContent = newReadmeContent + secSeparator + securityDisclosure;

        await Deno.writeTextFile(readmePath, newReadmeContent);

        console.log(
          `Added AI disclosure and Security statement to ${readmePath}`,
        );
      }

      if (!await hasLicenseFile(workspace)) {
        if (!defaultLicenseFile) {
          try {
            defaultLicenseFile = await Deno.readTextFile("LICENSE");
          } catch {
            // ignore
          }
        }
        if (defaultLicenseFile) {
          const licensePath = join(workspace, "LICENSE");
          const newLicenseContent = defaultLicenseFile;
          await Deno.writeTextFile(licensePath, newLicenseContent);

          console.log(`Added MIT license to ${licensePath}`);
        }
      }

      if (!await denoJsonHasLicenseAndTags(workspace)) {
        const denoJsonPath = join(workspace, "deno.json");
        let denoJsonContent = "";
        try {
          denoJsonContent = await Deno.readTextFile(denoJsonPath);
        } catch {
          // ignore
        }
        let newDenoJsonContent = denoJsonContent;

        if (denoJsonContent) {
          try {
            const denoJson = JSON.parse(denoJsonContent);
            if (!denoJson.license) {
              denoJson.license = "MIT";
            }
            denoJson.tags = [...new Set([...denoJson.tags ?? [], ...aiTags])];
            newDenoJsonContent = JSON.stringify(denoJson, null, 2);
            await Deno.writeTextFile(denoJsonPath, newDenoJsonContent);

            console.log(`Added MIT license and AI tags to ${denoJsonPath}`);
          } catch {
            console.warn(`Failed to parse ${denoJsonPath}`);
          }
        }
      }
    }
  });

if (import.meta.main) {
  await aiDisclosureCommand.parse(Deno.args);
}

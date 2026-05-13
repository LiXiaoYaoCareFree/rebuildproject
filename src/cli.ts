import { Command } from "commander";
import chalk from "chalk";
import { registerGenerate } from "./commands/generate.js";
import { registerConfig } from "./commands/config.js";
import { registerPreview } from "./commands/preview.js";
import { registerVerify } from "./commands/verify.js";
import { registerDoctor } from "./commands/doctor.js";

const program = new Command();

program
  .name("rebuildproject")
  .description(
    "把本地代码反推成一份可执行的搭建手册——按层级一步一步教你重建项目"
  )
  .version("0.4.0");

registerGenerate(program);
registerConfig(program);
registerPreview(program);
registerVerify(program);
registerDoctor(program);

program.parseAsync(process.argv).catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(chalk.red(`✖ ${msg}`));
  process.exit(1);
});

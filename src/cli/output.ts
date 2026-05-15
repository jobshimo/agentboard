// Whether ANSI color should be emitted. Respects the NO_COLOR env convention
// (https://no-color.org/) and also suppresses color when stdout is not a TTY
// (piped output — matches TermNoColor mock in cli.jsx).
const colorEnabled =
  !process.env["NO_COLOR"] && process.stdout.isTTY === true;

// ANSI helpers — only applied when color is active
const c = {
  reset: colorEnabled ? "\x1b[0m" : "",
  green: colorEnabled ? "\x1b[32m" : "",
  yellow: colorEnabled ? "\x1b[33m" : "",
  red: colorEnabled ? "\x1b[31m" : "",
  cyan: colorEnabled ? "\x1b[36m" : "",
  bold: colorEnabled ? "\x1b[1m" : "",
  dim: colorEnabled ? "\x1b[2m" : "",
};

export function printLine(line: string): void {
  process.stdout.write(line + "\n");
}

export function printError(line: string): void {
  process.stderr.write(line + "\n");
}

// TermLaunch / TermFirstRun banner — matches cli.jsx §1 box-drawing style
export function printBanner(opts: {
  version: string;
  port: number;
  cwd: string;
  firstRun: boolean;
  webBundlePresent: boolean;
}): void {
  const { version, port, cwd, webBundlePresent } = opts;
  const repoName = cwd.split(/[\\/]/).at(-1) ?? cwd;
  const dbPath = ".agentboard/db.sqlite";

  if (opts.firstRun) {
    printLine("");
    printLine(
      `${c.yellow}!${c.reset} ${c.dim}no ${c.reset}${c.bold}.agentboard/${c.reset}${c.dim} here. starting empty.${c.reset}`,
    );
    printLine("");
    printLine(`${c.dim}╭─ first run ───────────────────────────────────────────────╮${c.reset}`);
    printLine(`${c.dim}│${c.reset}  the board will work, but pick a workflow when ready:    ${c.dim}│${c.reset}`);
    printLine(`${c.dim}│${c.reset}                                                          ${c.dim}│${c.reset}`);
    printLine(`${c.dim}│${c.reset}  ${c.green}$${c.reset} ${c.bold}agentboard init${c.reset}  ${c.dim}copies a template into .agentboard/ ${c.reset} ${c.dim}│${c.reset}`);
    printLine(`${c.dim}╰───────────────────────────────────────────────────────────╯${c.reset}`);
    printLine("");
  } else {
    printLine("");
    printLine(`${c.dim}╭─ agentboard ──────────────────────────────────────────────╮${c.reset}`);
    printLine(`${c.dim}│${c.reset}  ${c.cyan}◆${c.reset} ${c.bold}agentboard${c.reset} ${c.dim}v${version}${c.reset}                                       ${c.dim}│${c.reset}`);
    printLine(`${c.dim}│${c.reset}  ${c.dim}repo${c.reset}  ${repoName}                                            ${c.dim}│${c.reset}`);
    printLine(`${c.dim}│${c.reset}  ${c.dim}store${c.reset} ${dbPath}                            ${c.dim}│${c.reset}`);
    printLine(`${c.dim}╰───────────────────────────────────────────────────────────╯${c.reset}`);
    printLine("");
  }

  if (webBundlePresent) {
    printLine(`${c.green}✓${c.reset} ${c.dim}web ui     ${c.reset} ${c.cyan}http://localhost:${port}${c.reset}`);
  } else {
    printLine(`${c.yellow}!${c.reset} ${c.dim}web ui     ${c.reset} ${c.dim}no dist/web/ bundle — run ${c.reset}${c.bold}pnpm dev:web${c.reset}${c.dim} (Vite on :5173)${c.reset}`);
  }
  printLine(`${c.green}✓${c.reset} ${c.dim}mcp        ${c.reset} ${c.cyan}http://localhost:${port}/mcp${c.reset}`);
  printLine(`${c.green}✓${c.reset} ${c.dim}websocket  ${c.reset} ${c.cyan}ws://localhost:${port}/ws${c.reset}`);
  printLine("");
}

// TermErrPort — matches cli.jsx §8
export function printPortError(port: number): void {
  printError("");
  printError(`${c.red}✗${c.reset} ${c.bold}port ${port} is in use${c.reset}`);
  printError("");
  printError(`${c.dim}  another process is listening on ${c.reset}${c.cyan}localhost:${port}${c.reset}${c.dim}.${c.reset}`);
  printError("");
  printError(`${c.dim}try${c.reset}`);
  printError(`  ${c.green}$${c.reset} ${c.bold}lsof -i :${port}${c.reset}                  ${c.dim}# find who has it${c.reset}`);
  printError(`  ${c.green}$${c.reset} ${c.bold}npx @jobshimo/agentboard --port 7800${c.reset}`);
}

// TermHelp — matches cli.jsx §5
export function printHelp(): void {
  printLine("");
  printLine(`  ${c.bold}agentboard${c.reset}  ${c.dim}·  a local board for the human/agent loop${c.reset}`);
  printLine("");
  printLine(`${c.dim}usage${c.reset}`);
  printLine(`  ${c.bold}npx @jobshimo/agentboard${c.reset} ${c.dim}[command]${c.reset} ${c.dim}[flags]${c.reset}`);
  printLine("");
  printLine(`${c.dim}commands${c.reset}`);
  printLine(`  ${c.cyan}(default)${c.reset}        ${c.dim}start server and open browser${c.reset}`);
  printLine(`  ${c.cyan}init${c.reset}             ${c.dim}copy a workflow template into .agentboard/${c.reset}`);
  printLine(`  ${c.cyan}export${c.reset}           ${c.dim}dump board state to .agentboard/snapshot/${c.reset}`);
  printLine("");
  printLine(`${c.dim}flags${c.reset}`);
  printLine(`  ${c.cyan}--port${c.reset} ${c.dim}<n>${c.reset}       ${c.dim}override default port (7733)${c.reset}`);
  printLine(`  ${c.cyan}--no-open${c.reset}        ${c.dim}start server without opening the browser${c.reset}`);
  printLine(`  ${c.cyan}--help${c.reset}           ${c.dim}this screen${c.reset}`);
  printLine(`  ${c.cyan}--version${c.reset}        ${c.dim}print version and exit${c.reset}`);
  printLine("");
  printLine(`${c.dim}environment${c.reset}`);
  printLine(`  ${c.cyan}NO_COLOR=1${c.reset}       ${c.dim}disable color output${c.reset}`);
  printLine(`  ${c.cyan}AGB_HOME${c.reset}         ${c.dim}override ~/.agentboard/ (workflow templates + config)${c.reset}`);
  printLine("");
  printLine(`${c.dim}more${c.reset}`);
  printLine(`  ${c.cyan}https://github.com/jobshimo/agentboard${c.reset}`);
  printLine("");
}

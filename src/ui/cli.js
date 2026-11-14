import readline from 'readline';

// ANSI terminal color codes
export const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
};

export class TerminalUI {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  printBanner(providers, mode) {
    console.log(`\n${C.bold}${C.cyan}╔════════════════════════════════════════════════════════════════╗${C.reset}`);
    console.log(`${C.bold}${C.cyan}║   🔥 KILN AI CODING AGENT                                     ║${C.reset}`);
    console.log(`${C.bold}${C.cyan}║   Free Claude Code Alternative with Auto-Failover Router       ║${C.reset}`);
    console.log(`${C.bold}${C.cyan}╚════════════════════════════════════════════════════════════════╝${C.reset}\n`);

    console.log(`${C.bold}Configured Providers in Failover Order:${C.reset}`);
    providers.forEach((p, idx) => {
      console.log(`  ${C.green}${idx + 1}.${C.reset} ${C.bold}${p.name}${C.reset} ${C.gray}(${p.model})${C.reset}`);
    });

    console.log(`\n${C.bold}Execution Mode:${C.reset} ${mode === 'AUTO' ? C.yellow + '⚡ AUTO (Runs commands automatically)' : C.green + '🛡️ CONFIRM (Prompts before shell commands)'}${C.reset}`);
    console.log(`${C.gray}Type your task or command below. Type /help for slash commands.${C.reset}\n`);
  }

  printFailoverAlert({ previous, reason, next, retrySeconds, resetTime }) {
    console.log(`\n${C.yellow}⚠️  [AUTO-FAILOVER TRIGGERED]${C.reset}`);
    console.log(`   ${C.bold}${previous.name}${C.reset} failed: ${C.red}${reason}${C.reset}`);
    if (retrySeconds && resetTime) {
      console.log(`   ${C.cyan}⏳ Quota refreshes in: ~${retrySeconds}s (estimated at ${resetTime})${C.reset}`);
    }
    console.log(`   ${C.green}▶ Swapping to backup model:${C.reset} ${C.bold}${next.name}${C.reset} ${C.gray}(${next.model})${C.reset}\n`);
  }

  printStep(step) {
    switch (step.type) {
      case 'thinking':
        process.stdout.write(`\r${C.cyan}🧠 Thinking (Step ${step.iteration}) [${step.provider}]...${C.reset} `);
        break;

      case 'tool_call':
        console.log(`\n${C.magenta}🔧 [Tool] ${C.bold}${step.name}${C.reset} ${C.gray}${JSON.stringify(step.args)}${C.reset}`);
        break;

      case 'tool_result':
        const preview = step.outputSnippet.replace(/\n/g, ' ').slice(0, 100);
        console.log(`   ${C.green}✔ ${C.gray}${preview}...${C.reset}`);
        break;
    }
  }

  printResponse(text) {
    console.log(`\n${C.bold}${C.green} Kiln:${C.reset}\n${text}\n`);
  }

  promptUser() {
    return new Promise((resolve) => {
      this.rl.question(`${C.bold}${C.cyan}you > ${C.reset}`, (answer) => {
        resolve(answer.trim());
      });
    });
  }

  promptConfirmation(command) {
    return new Promise((resolve) => {
      console.log(`\n${C.yellow}⚠️  The agent wants to execute this command:${C.reset}`);
      console.log(`   ${C.bold}${C.magenta}$ ${command}${C.reset}`);
      this.rl.question(`${C.bold}Allow execution? (y/N): ${C.reset}`, (answer) => {
        const approved = answer.trim().toLowerCase() === 'y';
        resolve(approved);
      });
    });
  }

  close() {
    this.rl.close();
  }
}

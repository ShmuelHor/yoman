// Throwaway probe for #5: the Semgrep gate must fail on this file. Reverted.
import { exec } from 'node:child_process';

export function runCommand(command: string): void {
  exec(command);
}

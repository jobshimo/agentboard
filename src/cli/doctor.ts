/**
 * `agentboard doctor` — structured diagnostic report.
 */
import { buildDoctorReport, formatDoctorReport } from "./doctor-report.js";
import { printLine } from "./output.js";

export interface DoctorOptions {
  agbHome: string;
}

export async function runDoctor(opts: DoctorOptions): Promise<void> {
  const report = await buildDoctorReport({ agbHome: opts.agbHome });
  const output = formatDoctorReport(report);
  printLine(output);
}

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface DiagnosticResult {
  name: string;
  required: boolean;
  status: CheckStatus;
  message: string;
  details?: string | undefined;
}

export interface DiagnosticCheck {
  name: string;
  required: boolean;
  run: () =>
    | Promise<Omit<DiagnosticResult, 'name' | 'required'>>
    | Omit<DiagnosticResult, 'name' | 'required'>;
}

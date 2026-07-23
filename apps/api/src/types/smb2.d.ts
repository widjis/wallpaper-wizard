declare module "smb2" {
  interface Smb2Options {
    share: string;
    domain?: string;
    username?: string;
    password?: string;
    autoCloseTimeout?: number;
  }

  type ExistsCallback = (error: Error | null, result?: boolean) => void;
  type ErrorCallback = (error: Error | null) => void;
  type ReadFileCallback = (error: Error | null, data: Buffer) => void;

  export default class SMB2 {
    constructor(options: Smb2Options);
    exists(target: string, callback: ExistsCallback): void;
    mkdir(target: string, callback: ErrorCallback): void;
    writeFile(target: string, data: Buffer, callback: ErrorCallback): void;
    readFile(target: string, callback: ReadFileCallback): void;
    close(): void;
  }
}

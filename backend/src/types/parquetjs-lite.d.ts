declare module 'parquetjs-lite' {
  export class ParquetSchema {
    constructor(def: Record<string, unknown>);
  }
  export class ParquetWriter {
    static openFile(schema: unknown, filePath: string): Promise<ParquetWriter>;
    appendRow(row: Record<string, unknown>): Promise<void>;
    close(): Promise<void>;
  }
}

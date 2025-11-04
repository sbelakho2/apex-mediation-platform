/* eslint-disable @typescript-eslint/no-explicit-any */
declare module 'parquetjs-lite' {
  export class ParquetSchema {
    constructor(def: Record<string, any>);
  }
  export class ParquetWriter {
    static openFile(schema: any, filePath: string): Promise<ParquetWriter>;
    appendRow(row: any): Promise<void>;
    close(): Promise<void>;
  }
}

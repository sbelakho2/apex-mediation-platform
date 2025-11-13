declare module 'csv-parse/sync' {
  import { Options as CsvParseOptions } from 'csv-parse'

  export interface SyncOptions extends CsvParseOptions {
    columns?: boolean | string[]
  }

  export function parse(input: string | Buffer, options?: SyncOptions): unknown[]
}

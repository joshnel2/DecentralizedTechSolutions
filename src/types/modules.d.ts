// Type declarations for modules without built-in types

declare module 'mammoth' {
  interface ExtractResult {
    value: string
    messages: any[]
  }
  
  interface Options {
    arrayBuffer?: ArrayBuffer
    path?: string
    buffer?: Buffer
  }
  
  export function extractRawText(options: Options): Promise<ExtractResult>
  export function convertToHtml(options: Options): Promise<ExtractResult>
}

declare module 'xlsx' {
  interface WorkBook {
    SheetNames: string[]
    Sheets: { [key: string]: WorkSheet }
  }
  
  interface WorkSheet {
    [key: string]: any
  }
  
  interface ReadOptions {
    type?: 'array' | 'string' | 'buffer' | 'base64' | 'binary' | 'file'
  }
  
  export function read(data: ArrayBuffer | string | Buffer, opts?: ReadOptions): WorkBook
  
  export const utils: {
    sheet_to_csv(sheet: WorkSheet): string
    sheet_to_json(sheet: WorkSheet): any[]
    sheet_to_html(sheet: WorkSheet): string
  }
}

export default interface Tool {
  name: string;
  description: string;
  inputSchema: any;
  execute: (input: any) => Promise<any>;
}

export interface CommandInterface {
  name: string;
  description: string;

  execute(message: any): Promise<any>;
}
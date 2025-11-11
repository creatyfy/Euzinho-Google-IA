
export enum Role {
  User = 'user',
  Model = 'model',
}

export interface Message {
  role: Role;
  content: string;
}

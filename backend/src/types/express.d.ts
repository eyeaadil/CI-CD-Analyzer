// This file extends the Express Request type to include our custom 'rawBody' property.

declare namespace Express {
  export interface Request {
    rawBody?: string;
  }
}

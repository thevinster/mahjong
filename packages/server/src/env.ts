export const PORT = Number(process.env.PORT ?? 3000);
export const HOST = process.env.HOST ?? '0.0.0.0';
export const NODE_ENV = process.env.NODE_ENV ?? 'development';
export const COOKIE_SECRET = process.env.COOKIE_SECRET ?? 'dev-secret-do-not-use-in-prod';

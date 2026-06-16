function required(name: string): string {
  const v = process.env[name];
  if (!v || v.length === 0) throw new Error(`missing env var ${name}`);
  return v;
}

export const env = {
  cookieSecret: process.env.COOKIE_SECRET ?? 'dev-secret-do-not-use-in-prod',
  pusher: {
    appId:   () => required('PUSHER_APP_ID'),
    key:     () => required('PUSHER_KEY'),
    secret:  () => required('PUSHER_SECRET'),
    cluster: () => required('PUSHER_CLUSTER'),
  },
} as const;

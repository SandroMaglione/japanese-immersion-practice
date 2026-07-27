export type WorkerEnvironment = Env & {
  readonly AUTH_PASSWORD: string;
  readonly AUTH_SIGNING_SECRET: string;
};

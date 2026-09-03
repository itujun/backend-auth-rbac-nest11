/**
 * Konfigurasi diakses lewat ConfigService dengan namespace (mis. `app.port`,
 * `database.url`) alih-alih `process.env.PORT` yang tersebar di banyak
 * tempat. Ini memudahkan testing (gampang mock) dan refactor.
 */
export default () => ({
  app: {
    env: process.env.NODE_ENV ?? 'development',
    port: parseInt(process.env.PORT ?? '3000', 10),
    corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  },
  database: {
    url: process.env.DATABASE_URL,
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
  },
});

export type AppConfig = ReturnType<typeof import('./configuration').default>;

import 'dotenv/config';
import { defineConfig } from 'prisma/config';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Prisma 7 removeu a propriedade `url` do bloco `datasource` no schema.prisma.
 * A URL de conexão agora vive aqui, e o runtime usa um Driver Adapter
 * (`@prisma/adapter-pg`) em vez do motor nativo.
 *
 * Docs: https://pris.ly/d/config-datasource
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    seed: 'ts-node prisma/seed.ts',
  },
  adapter: async () => {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error('DATABASE_URL não está definida no ambiente');
    }
    return new PrismaPg({ connectionString: url });
  },
});

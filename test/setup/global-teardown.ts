/**
 * Dijalankan SEKALI oleh Jest setelah SEMUA file *.e2e-spec.ts selesai
 * (lihat "globalTeardown" di jest-e2e.json). Menghentikan container yang
 * sama persis yang dinyalakan global-setup.ts -- lihat komentar di sana
 * soal kenapa globalThis aman dipakai untuk "titip" instance ini.
 */
export default async function globalTeardown(): Promise<void> {
  const container = globalThis.__E2E_PG_CONTAINER__;

  if (container) {
    await container.stop();
  }
}

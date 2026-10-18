# JaMovies

Addon Stremio. Satu sumber: scraper [nxsha.space](https://nxsha.space). Provider lama (VidSrc, MWAPI, ApieJakeren, MovieWeb) sudah dibuang.

Stremio mengirim IMDb id. Addon mengubahnya ke TMDB, lalu memanggil `/api/servers` dan `/api/sources` nxsha secara paralel. Tiap link dicek dulu. Playlist harus `#EXTM3U` dan segmen pertamanya harus mengembalikan byte. File langsung `.mp4`, `.mkv`, dan `.webm` juga lolos kalau header videonya valid (`ftyp` atau Matroska). Yang mati tidak dikirim ke Stremio.

## Jalankan

```bash
npm install
npm start
```

Manifest: `http://localhost:7000/manifest.json`

Di Stremio: Settings → Addons → Install from URL → tempel URL manifest.

## Env

| Variabel | Fungsi |
|---|---|
| `PORT` | Port lokal, default `7000` |
| `ADDON_URL` | URL publik tanpa slash akhir, misalnya `https://nama.vercel.app`. Kalau kosong, host request yang dipakai. |
| `TMDB_API_KEY` | Key TMDB untuk IMDb → TMDB. Ada fallback bawaan. |

## Struktur

```
index.js          addon Stremio + HTTP handler (lokal dan Vercel)
src/nxsha.js      enkripsi request + klien API nxsha
src/tmdb.js       IMDb / tmdb: id → TMDB id
src/streams.js    ubah sumber jadi stream Stremio, cache 10 menit
src/probe.js      cek playlist + segmen pertama, buang yang mati
src/play.js       proxy HLS: unwrap, audio, range
src/origin.js     URL publik untuk Vercel dan lokal
```

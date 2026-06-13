# Objava in naslednji koraki

## 1. Prva objava na GitHub Pages

1. Na GitHubu ustvarite prazen repozitorij, na primer `dostava-pro`.
2. V repozitorij naložite vse datoteke iz te mape.
3. Odprite `Settings > Pages`.
4. Pri `Build and deployment` izberite `Deploy from a branch`.
5. Izberite vejo `main` in mapo `/ (root)`.
6. Počakajte približno minuto in odprite prikazani spletni naslov.

Ta način je primeren za pregled in preizkus na eni napravi. Podatki so shranjeni
v brskalniku, zato se med različnimi telefoni še ne sinhronizirajo.

## 2. Produkcijska različica

Za istočasno delo dispečerja in več voznikov bomo dodali:

- Supabase projekt za PostgreSQL podatkovno bazo;
- prijavo z uporabniškimi vlogami `admin`, `dispatcher` in `driver`;
- sprotno sinhronizacijo dostav;
- shranjevanje podpisov in fotografij;
- samodejno izdelavo ter pošiljanje PDF dobavnic;
- zemljevid, lokacijo vozila in optimizacijo poti.

Za to fazo je primernejša objava na Vercelu ali Netlifyju, GitHub pa ostane
glavno mesto za izvorno kodo.

## 3. Varnost

V GitHub nikoli ne naložite gesel, zasebnih API ključev ali datoteke `.env`.
Javni Supabase ključ se lahko uporablja v spletni aplikaciji samo skupaj s
pravilno nastavljenimi Row Level Security pravili.

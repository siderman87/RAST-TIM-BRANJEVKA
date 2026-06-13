# DostavaPro

Delujoča prva različica sistema za upravljanje dostav, vozil, voznikov in
elektronskih dobavnic.

## Trenutno vključuje

- dispečersko nadzorno ploščo;
- evidenco vozil in voznikov;
- ustvarjanje in razporejanje dostav;
- mobilni pogled voznika;
- statuse dostave;
- elektronsko dobavnico in podpis prejemnika;
- tisk oziroma shranjevanje dobavnice v PDF;
- pripravo e-pošte prejemniku;
- lokalno shranjevanje in izvoz podatkov JSON.
- ločeno prijavo za administratorja in voznike;
- voznik vidi samo svoje dodeljene dostave;
- administrator lahko dodaja vozniške račune.
- uvoz dobavnic iz TRIS v obliki CSV, TXT, XML ali tekstovni PDF;
- predogled uvoza in samodejno preprečevanje dvojnikov.
- samodejno razdelitev več dobavnic iz enega večstranskega PDF-ja.

Navodila in vzorčna datoteka so v [TRIS-UVOZ.md](TRIS-UVOZ.md) ter
`TRIS-VZOREC.csv`.

## Začetna prijava

Administrator:

- uporabniško ime: `admin`
- geslo: `admin123`

Testni vozniki:

- `gregor` / `1111`
- `marko` / `2222`
- `luka` / `3333` (račun je označen kot odsoten)

## Zagon

Odprite `index.html` ali v mapi zaženite:

```bash
python -m http.server 8000
```

Nato odprite `http://localhost:8000`.

## GitHub Pages

Datoteke naložite v GitHub repozitorij. V `Settings > Pages` izberite
`Deploy from a branch`, vejo `main` in mapo `/ (root)`.

## Pomembno

Ta različica podatke in lokalna gesla hrani v brskalniku ter je namenjena
prvemu preizkusu. Prijava loči prikaz, ni pa nadomestilo za varno strežniško
avtentikacijo.
Za skupno uporabo več dispečerjev in voznikov potrebuje:

1. Supabase podatkovno bazo in prijavo;
2. strežniško pošiljanje e-pošte;
3. shranjevanje podpisov in fotografij;
4. zemljevid ter GPS sledenje;
5. varnostna pravila in uporabniške vloge.

Koda je pripravljena tako, da se te funkcije dodajo v naslednji fazi.

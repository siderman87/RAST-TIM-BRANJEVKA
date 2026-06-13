# Uvoz dobavnic iz TRIS

V DostavaPro se prijavite kot administrator in odprite:

`Dostave > Uvozi iz TRIS`

Podprte so datoteke CSV, TXT in XML. CSV lahko uporablja podpičje, vejico ali
tabulator. Ena vrstica predstavlja eno postavko. Vrstice z isto številko
dobavnice se samodejno združijo.

## Priporočeni stolpci

| Podatek | Priporočeno ime stolpca |
|---|---|
| Številka dobavnice | `StevilkaDobavnice` |
| Datum | `DatumDobavnice` |
| Prejemnik | `NazivKupca` |
| E-pošta | `Email` |
| Naslov | `NaslovDostave` |
| Pošta in kraj | `Posta` |
| Artikel | `NazivArtikla` |
| Količina | `Kolicina` |
| Enota | `Enota` |
| Opomba | `Opomba` |

Uvoz prepozna tudi več pogostih različic imen, na primer `Kupec`, `Partner`,
`Datum`, `Artikel`, `Kol`, `EM`, `Naslov` in angleška imena.

## Dvojniki

Če dobavnica z isto številko že obstaja, je v predogledu označena kot
`Preskočeno` in se ne uvozi ponovno.

Datoteka `TRIS-VZOREC.csv` je pripravljena kot primer pravilne strukture.

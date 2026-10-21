# Lekki geoportal

Niezależna, lekka aplikacja mapowa dla osób, które chcą szybko sprawdzić działkę: granice, numer, przeznaczenie w planie, ceny w okolicy, ortofotomapę aktualną i archiwalną. Interfejs w stylu map konsumenckich, dane na żywo z usług GUGiK (geoportal.gov.pl).

Status: koncepcja.

## Stack (planowany)

OpenLayers 10 z widokiem w EPSG:2180, Vite, React 19, TypeScript, Tailwind CSS, PWA. Bez backendu: hosting statyczny (Cloudflare Pages), opcjonalny bezstanowy Worker jako proxy dla usług bez CORS. Kod open source na licencji MIT.

## Dane

Wszystkie dane pochodzą z usług sieciowych Głównego Urzędu Geodezji i Kartografii i są pobierane na żywo. Aplikacja nie kopiuje ani nie przechowuje danych GUGiK. Źródło: geoportal.gov.pl.
